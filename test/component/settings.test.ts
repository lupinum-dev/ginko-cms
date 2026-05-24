/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMember, seedSettings } from '../helpers'

describe('cms settings visibility', () => {
  it('returns only sanitized settings to read-only viewers', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx, {
      webhooks: [
        {
          id: 'hook-1',
          name: 'Publish hook',
          url: 'https://example.test/hook',
          enabled: true,
          events: ['entry.published'],
          secretFingerprint: 'sha256:abc123',
        },
      ],
    })

    const viewer = ctx.asCmsUser('viewer-1')
    const studioSettings = await viewer.query(api.settings.getStudioSettings, {})

    expect(studioSettings).toMatchObject({
      locales: [{ code: 'en', label: 'English', isDefault: true }],
      updatedBy: 'owner-1',
    })
    expect(studioSettings).not.toHaveProperty('webhooks')
    expect(JSON.stringify(studioSettings)).not.toContain('sha256:abc123')
  })

  it('denies full settings reads for viewers while exposing only non-secret owner config', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx, {
      webhooks: [
        {
          id: 'hook-1',
          name: 'Publish hook',
          url: 'https://example.test/hook',
          enabled: true,
          events: ['entry.published'],
          secretFingerprint: 'sha256:abc123',
        },
      ],
    })

    const owner = ctx.asCmsUser('owner-1')
    const viewer = ctx.asCmsUser('viewer-1')

    await expect(viewer.query(api.settings.getSettings, {})).rejects.toThrow(
      'Forbidden: Manage settings',
    )

    const fullSettings = await owner.query(api.settings.getSettings, {})
    expect(fullSettings?.webhooks).toEqual([
      {
        id: 'hook-1',
        name: 'Publish hook',
        url: 'https://example.test/hook',
        enabled: true,
        events: ['entry.published'],
        secretFingerprint: 'sha256:abc123',
      },
    ])
    expect(fullSettings).not.toHaveProperty('apiKeys')
    expect(JSON.stringify(fullSettings)).not.toContain('topsecret')
    expect(JSON.stringify(fullSettings)).not.toContain('supersecret')
  })

  it('rejects webhook endpoints that are not HTTPS', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.settings.updateSettings, {
        webhooks: [
          {
            id: 'hook-1',
            name: 'Local hook',
            url: 'http://localhost:3000/hook',
            enabled: true,
            events: ['entry.published'],
            secretFingerprint: null,
          },
        ],
      }),
    ).rejects.toThrow('WEBHOOK_URL_HTTPS_REQUIRED')
  })

  it('rejects raw API keys and webhook secrets at the settings mutation boundary', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.settings.updateSettings, {
        apiKeys: {
          keys: [{ name: 'Root', secret: 'supersecret' }],
        },
      } as never),
    ).rejects.toThrow()

    await expect(
      owner.mutation(api.settings.updateSettings, {
        webhooks: [
          {
            id: 'hook-1',
            name: 'Publish hook',
            url: 'https://example.test/hook',
            enabled: true,
            events: ['entry.published'],
            secret: 'topsecret',
            secretFingerprint: null,
          },
        ],
      } as never),
    ).rejects.toThrow()
  })
})
