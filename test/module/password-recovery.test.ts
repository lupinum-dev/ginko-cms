import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendGinkoPasswordResetEmail } from '../../packages/cms/templates/convex/ginkoCms/passwordRecovery'

const previousUrl = process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL
const previousToken = process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  if (previousUrl === undefined) delete process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL
  else process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL = previousUrl
  if (previousToken === undefined) delete process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
  else process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN = previousToken
})

describe('[ACC-05] password recovery delivery boundary', () => {
  it('sends the provider-owned one-time URL only to the approved bounded HTTPS webhook', async () => {
    process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL =
      'https://mailer.example.test/password-recovery'
    process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN = 'webhook-secret'
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await sendGinkoPasswordResetEmail({
      user: { email: 'member@example.test', name: 'CMS Member' },
      url: 'https://deployment.example.test/api/auth/reset-password/one-time-token?callbackURL=safe',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://mailer.example.test/password-recovery')
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: 'Bearer webhook-secret',
        'content-type': 'application/json',
      },
    })
    expect(JSON.parse(String(options?.body))).toEqual({
      event: 'ginko-cms.password-recovery.requested',
      recipient: { email: 'member@example.test', name: 'CMS Member' },
      recoveryUrl:
        'https://deployment.example.test/api/auth/reset-password/one-time-token?callbackURL=safe',
    })
  })

  it('rejects missing, insecure, or credential-bearing webhook configuration before egress', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN = 'secret'

    for (const endpoint of [
      '',
      'http://mailer.example.test/recover',
      'https://user:password@mailer.example.test/recover',
    ]) {
      process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL = endpoint
      await expect(
        sendGinkoPasswordResetEmail({
          user: { email: 'member@example.test', name: 'CMS Member' },
          url: 'https://deployment.example.test/reset',
        }),
      ).rejects.toThrow(/not configured|HTTPS URL without embedded credentials/i)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
