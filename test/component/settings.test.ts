/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMember } from '../helpers'

describe('CMS settings visibility', () => {
  it('returns the installed Content locale projection to a read-only viewer', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    const contract = buildResolvedContentContract(
      { collections: {} },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const presentation = { collections: {} }
    await ctx.raw.mutation(api.contract.installCmsContract, {
      content: contract,
      contentHash: await hashCanonicalJson(contract),
      presentation,
      presentationHash: await hashCanonicalJson(presentation),
    })

    await expect(
      ctx.asCmsUser('viewer-1').query(api.settings.getStudioSettings, {}),
    ).resolves.toEqual({
      locales: [{ code: 'en', label: 'en', isDefault: true }],
      updatedAt: expect.any(Number),
      updatedBy: 'deployment',
    })
  })
})
