import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

import {
  encodeOperatorBrowserRequest,
  isValidOperatorConvexToken,
  MAX_OPERATOR_TOKEN_RESPONSE_BYTES,
  OPERATOR_BROWSER_LOGIN_ROUTE,
  OPERATOR_BROWSER_STATE_PATTERN,
} from '../server/utils/operator-token-contract.js'
import { resolveOperatorSiteOrigin } from './operator.js'

const LOGIN_TIMEOUT_MS = 5 * 60_000

export async function authorizeOperatorInBrowser(
  siteOrigin: string,
  options: {
    open?: (url: string) => void | Promise<void>
    timeoutMs?: number
    onUrl?: (url: string) => void
  } = {},
): Promise<string> {
  const login = new URL(OPERATOR_BROWSER_LOGIN_ROUTE, resolveOperatorSiteOrigin(siteOrigin))
  const state = randomBytes(32).toString('base64url')
  if (!OPERATOR_BROWSER_STATE_PATTERN.test(state)) throw new Error('Could not create login state.')

  let resolveToken!: (token: string) => void
  let rejectToken!: (error: Error) => void
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve
    rejectToken = reject
  })
  let settled = false
  const server = createServer((request, response) => {
    if (settled) {
      response.writeHead(410).end('This operator login is no longer active.')
      return
    }
    if (request.method !== 'POST' || request.url !== '/callback') {
      response.writeHead(404).end('Not found.')
      return
    }
    const contentType = request.headers['content-type']?.split(';')[0]?.trim()
    if (contentType !== 'application/x-www-form-urlencoded') {
      response.writeHead(415).end('Invalid operator login response.')
      return
    }
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > MAX_OPERATOR_TOKEN_RESPONSE_BYTES) request.destroy()
      else chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
        const returnedState = form.get('state')
        const token = form.get('token')
        if (returnedState !== state || !isValidOperatorConvexToken(token)) {
          response.writeHead(400).end('Invalid operator login response.')
          return
        }
        settled = true
        response
          .writeHead(200, {
            'cache-control': 'no-store',
            'content-type': 'text/html; charset=utf-8',
            'referrer-policy': 'no-referrer',
          })
          .end(
            '<!doctype html><title>Ginko CMS migration authorized</title><p>Authorization complete. You can close this tab.</p>',
          )
        resolveToken(token)
      } catch {
        response.writeHead(400).end('Invalid operator login response.')
      }
    })
    request.on('error', () => {})
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not start the local operator login callback.')
  }
  const callback = `http://127.0.0.1:${address.port}/callback`
  login.searchParams.set('request', encodeOperatorBrowserRequest({ callback, state }))
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      rejectToken(new Error('Operator browser login timed out.'))
    }
  }, options.timeoutMs ?? LOGIN_TIMEOUT_MS)
  try {
    options.onUrl?.(login.href)
    await (options.open ?? openBrowser)(login.href)
    return await tokenPromise
  } finally {
    settled = true
    clearTimeout(timeout)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : process.platform === 'win32'
        ? { file: 'cmd', args: ['/c', 'start', '', url] }
        : { file: 'xdg-open', args: [url] }
  const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore' })
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Could not open the operator login in a browser.')))
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error('Could not open the operator login in a browser.'))
    })
  })
}
