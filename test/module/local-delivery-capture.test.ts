import { once } from 'node:events'

import { afterEach, describe, expect, it } from 'vitest'

import { startLocalDeliveryCapture } from '../../scripts/local-delivery-capture.mjs'

const servers: Array<ReturnType<typeof startLocalDeliveryCapture>['server']> = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

async function fixture() {
  const capture = startLocalDeliveryCapture({
    environment: { GINKO_LOCAL_DELIVERY_SECRET: 'synthetic-secret' },
    port: 0,
  })
  servers.push(capture.server)
  await once(capture.server, 'listening')
  const address = capture.server.address()
  if (!address || typeof address === 'string') throw new Error('Capture server did not bind TCP.')
  return { ...capture, origin: `http://127.0.0.1:${address.port}` }
}

describe('[AD-03] local delivery capture', () => {
  it('captures invitation links in memory without logging or external delivery', async () => {
    const capture = await fixture()
    const response = await fetch(`${capture.origin}/member-invitation`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'editor@example.test',
        role: 'editor',
        acceptUrl: 'http://localhost:3000/studio/invitations/accept#token=one-time-token',
      }),
    })

    expect(response.status).toBe(204)
    expect(capture.messages).toEqual([
      {
        kind: 'Member invitation (editor)',
        recipient: 'editor@example.test',
        url: 'http://localhost:3000/studio/invitations/accept#token=one-time-token',
      },
    ])
    const inbox = await fetch(capture.origin)
    expect(inbox.headers.get('cache-control')).toBe('no-store')
    expect(await inbox.text()).toContain('Open one-time link')
  })

  it('captures provider-owned verification links in memory', async () => {
    const capture = await fixture()
    const response = await fetch(`${capture.origin}/email-verification`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { email: 'viewer@example.test' },
        verificationUrl: 'http://localhost:3000/api/auth/verify-email?token=one-time-token',
      }),
    })

    expect(response.status).toBe(204)
    expect(capture.messages).toEqual([
      {
        kind: 'Email verification',
        recipient: 'viewer@example.test',
        url: 'http://localhost:3000/api/auth/verify-email?token=one-time-token',
      },
    ])
  })

  it('rejects unauthenticated, unknown, and oversized delivery requests', async () => {
    const capture = await fixture()

    const unauthenticated = await fetch(`${capture.origin}/password-recovery`, {
      method: 'POST',
      body: '{}',
    })
    const unknown = await fetch(`${capture.origin}/unknown`, { method: 'POST' })
    const oversized = await fetch(`${capture.origin}/password-recovery`, {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-secret' },
      body: 'x'.repeat(17 * 1024),
    })

    expect(unauthenticated.status).toBe(401)
    expect(unknown.status).toBe(404)
    expect(oversized.status).toBe(400)
    expect(capture.messages).toEqual([])
  })
})
