/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { getLocaleChain } from '../../../packages/convex/src/lib/locale'
import { api, createCtx, publishEntry, seedOwner } from '../../helpers'

async function installLocalizedContract(ctx: ReturnType<typeof createCtx>) {
  const content = buildResolvedContentContract(
    {
      collections: {
        pages: {
          type: 'page',
          source: 'content/pages/**/*.md',
          i18n: true,
          route: { en: '/pages', de: '/seiten', 'de-CH': '/siite' },
          cms: { type: 'flat' },
        },
      },
    },
    {
      defaultLocale: 'en',
      locales: ['en', 'de', 'de-CH'],
      localeFallbacks: { en: [], de: ['en'], 'de-CH': ['de', 'en'] },
    },
  )
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

describe('locale fallback chain via the canonical public tree', () => {
  it('reads the exact fallback chain from the installed contract', async () => {
    const ctx = createCtx()
    await installLocalizedContract(ctx)

    await expect(
      ctx.raw.run(async (inner) => await getLocaleChain(inner, 'de-CH')),
    ).resolves.toEqual({
      locale: 'de-CH',
      chain: ['de-CH', 'de', 'en'],
      defaultLocale: 'en',
    })
  })

  it('never synthesizes a route-backed locale from field fallbacks', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installLocalizedContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'pages',
      slug: 'about',
      localized: { title: 'About us' },
    })
    await publishEntry(owner, entryId, ['en'])

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'pages',
        path: '/siite/about',
        locale: 'de-CH',
      }),
    ).resolves.toMatchObject({ status: 'not-found', page: null })
    await expect(
      ctx.raw.query(api.public.routeMeta, {
        collection: 'pages',
        path: '/siite/about',
        locale: 'de-CH',
        fallback: ['de', 'en'],
      }),
    ).resolves.toMatchObject({ status: 'not-found', page: null })
  })

  it('rejects a locale outside the installed contract before route lookup', async () => {
    const ctx = createCtx()
    await installLocalizedContract(ctx)

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'pages',
        path: '/pages/missing',
        locale: 'ja',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'UNSUPPORTED_LOCALE',
    )
  })
})
