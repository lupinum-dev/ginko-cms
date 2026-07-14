/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMember, seedSettings } from '../helpers'

describe('CMS settings visibility', () => {
  it('returns the installed Content locale projection to a read-only viewer', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)

    await expect(
      ctx.asCmsUser('viewer-1').query(api.settings.getStudioSettings, {}),
    ).resolves.toEqual({
      locales: [{ code: 'en', label: 'English', isDefault: true }],
      updatedAt: expect.any(Number),
      updatedBy: 'owner-1',
    })
  })
})
