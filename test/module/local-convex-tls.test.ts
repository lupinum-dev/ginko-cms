import { once } from 'node:events'
import { createServer, type Server } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { storageProxyHandler, validateLocalTlsAuthority } from '../../scripts/local-convex-tls.mjs'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
})

async function listen(server: Server) {
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
  return `http://127.0.0.1:${address.port}`
}

const metadata = {
  ports: { cloud: 3421, site: 3422 },
  adminKey: 'synthetic-local-key',
  instanceSecret: 'synthetic-instance-secret',
  deploymentName: 'anonymous-test',
  backendVersion: 'precompiled-test',
}
const environment = {
  GINKO_LOCAL_TLS_ORIGIN: 'https://localhost:3443',
  GINKO_LOCAL_TLS_CERT: 'localhost.pem',
  GINKO_LOCAL_TLS_KEY: 'localhost-key.pem',
  CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3421',
  CONVEX_SELF_HOSTED_ADMIN_KEY: metadata.adminKey,
}

describe('optional local TLS transport', () => {
  it('only accepts the existing worktree backend authority and loopback TLS origin', () => {
    expect(validateLocalTlsAuthority(environment, metadata).origin.origin).toBe(
      'https://localhost:3443',
    )
    for (const change of [
      { GINKO_LOCAL_TLS_ORIGIN: 'https://example.com:3443' },
      { GINKO_LOCAL_TLS_ORIGIN: 'http://localhost:3443' },
      { GINKO_LOCAL_TLS_ORIGIN: 'https://user:secret@localhost:3443' },
      { GINKO_LOCAL_TLS_ORIGIN: 'https://localhost:3443/path' },
      { CONVEX_SELF_HOSTED_URL: 'https://production.convex.cloud' },
      { CONVEX_SELF_HOSTED_ADMIN_KEY: 'different-key' },
      { CONVEX_DEPLOYMENT: 'dev:hosted' },
      { CONVEX_DEPLOY_KEY: 'hosted-key' },
      { CONVEX_DEPLOYMENT_TOKEN: 'hosted-token' },
    ])
      expect(() => validateLocalTlsAuthority({ ...environment, ...change }, metadata)).toThrow()
  })

  it('forwards storage bytes and queries without forwarding browser credentials', async () => {
    const received: { path?: string; authorization?: string; cookie?: string; range?: string } = {}
    const backend = await listen(
      createServer((request, response) => {
        Object.assign(received, {
          path: request.url,
          authorization: request.headers.authorization,
          cookie: request.headers.cookie,
          range: request.headers.range,
        })
        response.writeHead(206, { 'content-type': 'image/png' })
        response.end('synthetic-image-bytes')
      }),
    )
    const proxy = await listen(createServer(storageProxyHandler(backend)))
    const result = await fetch(`${proxy}/api/storage/asset-id?component=component-id`, {
      headers: {
        authorization: 'Bearer must-not-forward',
        cookie: 'session=must-not-forward',
        range: 'bytes=0-20',
      },
    })
    expect(result.status).toBe(206)
    expect(await result.text()).toBe('synthetic-image-bytes')
    expect(received).toEqual({
      path: '/api/storage/asset-id?component=component-id',
      authorization: undefined,
      cookie: undefined,
      range: 'bytes=0-20',
    })
  })

  it('never exposes deployment or auth endpoints through the storage proxy', async () => {
    let requests = 0
    const backend = await listen(
      createServer((_request, response) => {
        requests++
        response.end()
      }),
    )
    const proxy = await listen(createServer(storageProxyHandler(backend)))
    for (const path of [
      '/api/query',
      '/api/mutation',
      '/api/auth/sign-in',
      '/api/storage/a/b',
      '/api/storage/%2fapi',
    ]) {
      expect((await fetch(`${proxy}${path}`)).status).toBe(404)
    }
    expect((await fetch(`${proxy}/api/storage/asset-id`, { method: 'DELETE' })).status).toBe(404)
    expect(requests).toBe(0)
    expect(() => storageProxyHandler('http://example.com:3421')).toThrow()
  })

  it('streams upload bytes to the capability URL without replacing its token', async () => {
    let received = ''
    let uploadPath = ''
    const backend = await listen(
      createServer((request, response) => {
        uploadPath = request.url ?? ''
        request.setEncoding('utf8')
        request.on('data', (chunk) => {
          received += chunk
        })
        request.on('end', () => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ storageId: 'synthetic-storage-id' }))
        })
      }),
    )
    const proxy = await listen(createServer(storageProxyHandler(backend)))
    const result = await fetch(`${proxy}/api/storage/upload?token=synthetic-capability`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: 'synthetic-image-bytes',
    })
    expect(await result.json()).toEqual({ storageId: 'synthetic-storage-id' })
    expect(received).toBe('synthetic-image-bytes')
    expect(uploadPath).toBe('/api/storage/upload?token=synthetic-capability')
  })
})
