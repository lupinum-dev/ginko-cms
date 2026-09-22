import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:https'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

export function validateLocalTlsAuthority(environment, backend) {
  const origin = new URL(environment.GINKO_LOCAL_TLS_ORIGIN)
  if (
    origin.protocol !== 'https:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    !origin.port ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error('GINKO_LOCAL_TLS_ORIGIN must be an explicit HTTPS loopback origin.')
  }
  const backendOrigin = `http://127.0.0.1:${backend.ports.cloud}`
  if (
    environment.CONVEX_DEPLOYMENT ||
    environment.CONVEX_DEPLOY_KEY ||
    environment.CONVEX_DEPLOYMENT_TOKEN ||
    environment.CONVEX_SELF_HOSTED_URL !== backendOrigin ||
    environment.CONVEX_SELF_HOSTED_ADMIN_KEY !== backend.adminKey
  ) {
    throw new Error('Local TLS requires this worktree’s existing backend authority only.')
  }
  if (
    !environment.GINKO_LOCAL_TLS_CERT ||
    !environment.GINKO_LOCAL_TLS_KEY ||
    !backend.adminKey ||
    !backend.deploymentName ||
    !backend.instanceSecret ||
    ![backend.ports.cloud, backend.ports.site].every(
      (port) => Number.isInteger(port) && port > 0 && port < 65536,
    ) ||
    typeof backend.backendVersion !== 'string' ||
    !/^[\w.-]+$/.test(backend.backendVersion)
  ) {
    throw new Error('Local TLS requires existing certificate files and complete backend metadata.')
  }
  return { origin, backendOrigin }
}

export function storageProxyHandler(backendOrigin) {
  const target = new URL(backendOrigin)
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    target.pathname !== '/' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error('Storage upstream must be a loopback backend.')
  return (incoming, response) => {
    const path = incoming.url ?? ''
    if (
      !['GET', 'HEAD', 'POST', 'OPTIONS'].includes(incoming.method) ||
      !/^\/api\/storage\/[a-zA-Z0-9_-]+(?:\?[^\r\n]*)?$/.test(path)
    ) {
      response.writeHead(404, { 'cache-control': 'no-store' })
      response.end()
      return
    }
    const headers = {}
    for (const name of [
      'content-type',
      'content-length',
      'range',
      'if-none-match',
      'origin',
      'access-control-request-method',
      'access-control-request-headers',
    ]) {
      if (incoming.headers[name]) headers[name] = incoming.headers[name]
    }
    const outgoing = httpRequest(
      new URL(path, target),
      { method: incoming.method, headers, timeout: 30_000 },
      (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers)
        upstream.pipe(response)
      },
    )
    outgoing.once('timeout', () => outgoing.destroy())
    outgoing.once('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'cache-control': 'no-store' })
      response.end()
    })
    incoming.once('aborted', () => outgoing.destroy())
    incoming.pipe(outgoing)
  }
}

export async function startLocalConvexTls({ rootDir, environment }) {
  const stateDir = resolve(rootDir, '.convex/local/default')
  const metadata = JSON.parse(readFileSync(resolve(stateDir, 'config.json'), 'utf8'))
  const { origin, backendOrigin } = validateLocalTlsAuthority(environment, metadata)
  const binary = resolve(
    homedir(),
    '.cache/convex/binaries',
    metadata.backendVersion,
    process.platform === 'win32' ? 'convex-local-backend.exe' : 'convex-local-backend',
  )
  if (!existsSync(binary) || !existsSync(resolve(stateDir, 'convex_local_backend.sqlite3')))
    throw new Error('Initialize the worktree’s local backend before opting into TLS.')
  // Refuse an already-running backend: only this launcher may own its data file.
  try {
    await fetch(`${backendOrigin}/version`, { signal: AbortSignal.timeout(500) })
    throw new Error('BACKEND_RUNNING')
  } catch (error) {
    if (error.message === 'BACKEND_RUNNING')
      throw new Error('Stop the current local backend before starting TLS mode.')
  }
  const proxy = createServer(
    {
      key: readFileSync(resolve(rootDir, environment.GINKO_LOCAL_TLS_KEY)),
      cert: readFileSync(resolve(rootDir, environment.GINKO_LOCAL_TLS_CERT)),
    },
    storageProxyHandler(backendOrigin),
  )
  await new Promise((ready, reject) => {
    proxy.once('error', reject)
    proxy.listen(Number(origin.port), '127.0.0.1', ready)
  })
  const child = spawn(
    binary,
    [
      '--interface',
      '127.0.0.1',
      '--port',
      String(metadata.ports.cloud),
      '--site-proxy-port',
      String(metadata.ports.site),
      '--convex-origin',
      origin.origin,
      '--convex-site',
      `http://127.0.0.1:${metadata.ports.site}`,
      '--instance-name',
      metadata.deploymentName,
      '--instance-secret',
      metadata.instanceSecret,
      '--local-storage',
      resolve(stateDir, 'convex_local_storage'),
      '--disable-beacon',
      resolve(stateDir, 'convex_local_backend.sqlite3'),
    ],
    { cwd: rootDir, stdio: 'ignore', env: { ...process.env, SENTRY_DSN: '' } },
  )
  let failed = false
  child.once('error', () => {
    failed = true
    proxy.close()
  })
  child.once('exit', () => {
    failed = true
    proxy.close()
  })
  const stop = () => {
    proxy.close()
    if (!child.killed) child.kill('SIGTERM')
  }
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failed) throw new Error('The pinned local backend failed to start.')
      try {
        const response = await fetch(`${backendOrigin}/instance_name`, {
          signal: AbortSignal.timeout(500),
        })
        if (response.ok && (await response.text()) === metadata.deploymentName) {
          console.log(`[local-tls] Storage ${origin.origin}; existing backend ${backendOrigin}`)
          return { child, proxy, stop }
        }
      } catch {
        /* The backend is still opening its existing database. */
      }
      await wait(100)
    }
    throw new Error('The local TLS backend did not become ready.')
  } catch (error) {
    stop()
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const environment = parseEnv(readFileSync(resolve(rootDir, '.env.local'), 'utf8'))
  const runtime = await startLocalConvexTls({ rootDir, environment })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, runtime.stop)
}
