/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { getLocaleChain } from '../../../packages/convex/src/lib/locale'
import { api, createCtx } from '../../helpers'

async function seedOwner(ctx: ReturnType<typeof createCtx>, userId = 'owner-1') {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    } as never,
  )
}

async function seedSettingsWithFallback(ctx: ReturnType<typeof createCtx>) {
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'de', label: 'German', fallback: 'en' },
        { code: 'de-CH', label: 'Swiss German', fallback: 'de' },
      ],
      webhooks: [],
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
    } as never,
  )
}

async function seedSettingsNoFallback(ctx: ReturnType<typeof createCtx>) {
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'fr', label: 'French' },
      ],
      webhooks: [],
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
    } as never,
  )
}

async function seedPublicProjection(
  ctx: ReturnType<typeof createCtx>,
  opts: {
    collectionId: string
    entryId: string
    requestedLocale: string
    locale: string
    resolvedLocale: string
    slug: string
    path: string
    title: string
    publishedAt: number
  },
) {
  const revisionId = await ctx.seed(
    'entryRevisions' as never,
    {
      entryId: opts.entryId,
      collectionId: opts.collectionId,
      parentRevisionId: null,
      kind: 'publish',
      snapshot: {
        parentEntryId: null,
        orderRank: 'a0',
        slug: opts.slug,
        shared: {},
        locales: {
          [opts.locale]: {
            slug: opts.slug,
            path: opts.path,
            values: { title: opts.title },
          },
        },
      },
      affectedLocales: [opts.locale],
      message: null,
      createdBy: 'owner-1',
      createdAt: opts.publishedAt,
    } as never,
  )
  await ctx.seed(
    'publicEntries' as never,
    {
      entryId: opts.entryId,
      revisionId,
      collectionId: opts.collectionId,
      locale: opts.locale,
      slug: opts.slug,
      path: opts.path,
      href: opts.path,
      title: opts.title,
      description: null,
      data: { title: opts.title },
      parentEntryId: null,
      orderKey: `a0\u0000${opts.entryId}`,
      cacheTags: [`entry:${opts.entryId}`],
      navIncluded: true,
      entryCreatedAt: opts.publishedAt,
      firstPublishedAt: opts.publishedAt,
      lastPublishedAt: opts.publishedAt,
    } as never,
  )
  await ctx.seed(
    'publicRoutes' as never,
    {
      entryId: opts.entryId,
      revisionId,
      collectionId: opts.collectionId,
      locale: opts.locale,
      path: opts.path,
      href: opts.path,
    } as never,
  )
}

describe('locale fallback chain via public API', () => {
  it('prefers the exact installed Content fallback chain over its lossy settings projection', async () => {
    const ctx = createCtx()
    await seedSettingsWithFallback(ctx)
    await ctx.seed(
      'cmsPolicies' as never,
      {
        key: 'active',
        contract: {
          defaultLocale: 'en',
          localeFallbacks: { 'de-CH': ['fr', 'en'] },
        },
        contractSha256: 'policy-a',
        installedAt: Date.now(),
        installedBy: 'deployment',
      } as never,
    )

    await expect(
      ctx.raw.run(async (inner) => await getLocaleChain(inner, 'de-CH')),
    ).resolves.toEqual({
      locale: 'de-CH',
      chain: ['de-CH', 'fr', 'en'],
      defaultLocale: 'en',
    })
  })

  it('does not synthesize route-backed fallback pages (de-CH -> de -> en)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettingsWithFallback(ctx)

    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de', 'de-CH'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const entryId = await ctx.seed(
      'entries' as never,
      {
        collectionId,
        baseSlug: 'about',
        stableId: null,
        status: 'published',
        dirtyLocales: [],
        parentEntryId: null,
        orderRank: 'a0',
        nodeKind: 'page',
        sortCache: {},
        draftVersion: 2,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        publishedBy: 'owner-1',
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } as never,
    )

    // Only publish "en" locale content; de and de-CH have no public rows.
    await seedPublicProjection(ctx, {
      collectionId: collectionId as string,
      entryId: entryId as string,
      requestedLocale: 'de-CH',
      locale: 'en',
      resolvedLocale: 'en',
      slug: 'about',
      path: '/pages/about',
      title: 'About us',
      publishedAt: now,
    })

    // Route-backed page reads require a real public route for the requested locale.
    // Field fallback is separate and must not synthesize localized routes.
    const result = await ctx.raw.query(api.public.page, {
      collection: 'pages',
      path: '/pages/about',
      locale: 'de-CH',
    })

    expect(result.status).toBe('not-found')
    expect(result.page).toBeNull()

    const exactResult = await ctx.raw.query(api.public.page, {
      collection: 'pages',
      path: '/pages/about',
      locale: 'de-CH',
      fallback: false,
    })
    expect(exactResult.status).toBe('not-found')
    expect(exactResult.page).toBeNull()
  })

  it('does not use explicit path fallback to synthesize a route', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettingsWithFallback(ctx)

    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de', 'de-CH'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const entryId = await ctx.seed(
      'entries' as never,
      {
        collectionId,
        baseSlug: 'contact',
        stableId: null,
        status: 'published',
        dirtyLocales: [],
        parentEntryId: null,
        orderRank: 'a0',
        nodeKind: 'page',
        sortCache: {},
        draftVersion: 2,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        publishedBy: 'owner-1',
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } as never,
    )

    // Publish both en and de locale content as public projection rows.
    await seedPublicProjection(ctx, {
      collectionId: collectionId as string,
      entryId: entryId as string,
      requestedLocale: 'de-CH',
      locale: 'de',
      resolvedLocale: 'de',
      slug: 'contact',
      path: '/pages/contact',
      title: 'Kontakt (Deutsch)',
      publishedAt: now,
    })

    // de-CH has no public route, so route-backed page reads stay not-found.
    const result = await ctx.raw.query(api.public.page, {
      collection: 'pages',
      path: '/pages/contact',
      locale: 'de-CH',
    })

    expect(result.status).toBe('not-found')
    expect(result.page).toBeNull()

    const explicitFallbackResult = await ctx.raw.query(api.public.routeMeta, {
      collection: 'pages',
      path: '/pages/contact',
      locale: 'de-CH',
      fallback: ['de'],
    })
    expect(explicitFallbackResult.status).toBe('not-found')
    expect(explicitFallbackResult.page).toBeNull()
  })

  it('returns null when no fallback is configured and the locale has no published content', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettingsNoFallback(ctx)

    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'fr'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const entryId = await ctx.seed(
      'entries' as never,
      {
        collectionId,
        baseSlug: 'privacy',
        stableId: null,
        status: 'published',
        dirtyLocales: [],
        parentEntryId: null,
        orderRank: 'a0',
        nodeKind: 'page',
        sortCache: {},
        draftVersion: 2,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        publishedBy: 'owner-1',
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } as never,
    )

    // Only publish English content as a public projection row.
    await seedPublicProjection(ctx, {
      collectionId: collectionId as string,
      entryId: entryId as string,
      requestedLocale: 'fr',
      locale: 'en',
      resolvedLocale: 'en',
      slug: 'privacy',
      path: '/pages/privacy',
      title: 'Privacy Policy',
      publishedAt: now,
    })

    // French has no public route. Default-locale field fallback must not create one.
    const result = await ctx.raw.query(api.public.page, {
      collection: 'pages',
      path: '/pages/privacy',
      locale: 'fr',
    })

    expect(result.status).toBe('not-found')
    expect(result.page).toBeNull()
  })

  it('returns null for a completely unknown locale with no matching content at all', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettingsNoFallback(ctx)

    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    await ctx.seed(
      'entries' as never,
      {
        collectionId,
        baseSlug: 'empty',
        stableId: null,
        status: 'published',
        dirtyLocales: [],
        parentEntryId: null,
        orderRank: 'a0',
        nodeKind: 'page',
        sortCache: {},
        draftVersion: 2,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        publishedBy: 'owner-1',
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } as never,
    )

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'pages',
        path: '/pages/empty',
        locale: 'ja',
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'UNSUPPORTED_LOCALE')
  })
})
