import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  sendGinkoPasswordResetEmail,
  sendGinkoVerificationEmail,
} from '../../packages/cms/templates/convex/ginkoCms/passwordRecovery'

const previousUrl = process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL
const previousToken = process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
const previousVerificationUrl = process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL
const previousVerificationToken = process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN
const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  if (previousUrl === undefined) delete process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL
  else process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL = previousUrl
  if (previousToken === undefined) delete process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
  else process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN = previousToken
  if (previousVerificationUrl === undefined)
    delete process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL
  else process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL = previousVerificationUrl
  if (previousVerificationToken === undefined)
    delete process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN
  else process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN = previousVerificationToken
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

  it('allows a loopback-only delivery capture during local development', async () => {
    process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL = 'http://127.0.0.1:5251/password-recovery'
    process.env.GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN = 'local-webhook-secret'
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await sendGinkoPasswordResetEmail({
      user: { email: 'synthetic@example.test', name: 'Synthetic Member' },
      url: 'http://localhost:3000/api/auth/reset-password/one-time-token',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5251/password-recovery',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    )
  })

  it('delivers provider-owned email verification through the bounded webhook', async () => {
    process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL =
      'http://127.0.0.1:5251/email-verification'
    process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN = 'local-webhook-secret'
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await sendGinkoVerificationEmail({
      user: { email: 'synthetic@example.test', name: 'Synthetic Member' },
      url: 'http://localhost:3000/api/auth/verify-email?token=one-time-token',
    })

    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:5251/email-verification')
    expect(JSON.parse(String(options?.body))).toEqual({
      event: 'ginko-cms.email-verification.requested',
      recipient: { email: 'synthetic@example.test', name: 'Synthetic Member' },
      verificationUrl: 'http://localhost:3000/api/auth/verify-email?token=one-time-token',
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
      ).rejects.toThrow(/not configured|HTTPS.*loopback HTTP.*embedded credentials/i)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unsafe verification delivery and propagates failure instead of pretending delivery succeeded', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }))
    globalThis.fetch = fetchMock
    process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN = 'secret'
    const input = {
      user: { email: 'member@example.test', name: 'CMS Member' },
      url: 'https://deployment.example.test/api/auth/verify-email?token=one-time-token',
    }
    for (const endpoint of [
      '',
      'http://mailer.example.test/verify',
      'https://user:password@mailer.example.test/verify',
    ]) {
      process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL = endpoint
      await expect(sendGinkoVerificationEmail(input)).rejects.toThrow()
    }
    expect(fetchMock).not.toHaveBeenCalled()

    process.env.GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL = 'https://mailer.example.test/verify'
    await expect(sendGinkoVerificationEmail(input)).rejects.toThrow(
      'Email verification delivery failed with status 503.',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mailer.example.test/verify',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    )
  })
})
