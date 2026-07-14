/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  publishEntry,
  seedOwner,
  seedStorageObject,
  seedTreeFixture,
} from './entries/helpers'

const api = anyApi

async function seedSettings(
  ctx: ReturnType<typeof createCtx>,
  locales = [{ code: 'en', label: 'English', isDefault: true }],
) {
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales,
      webhooks: [],
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
    } as never,
  )
}

async function seedCollection(
  ctx: ReturnType<typeof createCtx>,
  input: {
    slug: string
    mode?: 'route' | 'none'
    locales?: string[]
    pathPrefix?: string
    slugMode?: 'shared' | 'localized' | 'stable' | 'localizedStable'
    fields?: Array<Record<string, unknown>>
  },
) {
  const now = Date.now()
  return await ctx.seed(
    'collections' as never,
    {
      slug: input.slug,
      label: { en: input.slug },
      icon: null,
      type: 'flat',
      routing: {
        mode: input.mode ?? 'route',
        pathPrefix: input.pathPrefix ?? `/${input.slug}`,
        slugMode: input.slugMode ?? 'shared',
        rootSlug: null,
        singleton: false,
      },
      locales: input.locales ?? ['en'],
      fields: input.fields ?? [
        { key: 'title', type: 'text', localized: true, required: true, searchable: true },
      ],
      settings: {},
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    } as never,
  )
}

async function seedPublishedEntry(
  ctx: ReturnType<typeof createCtx>,
  input: {
    collectionId: string
    collection: string
    locale: string
    slug: string
    path: string
    href?: string
    title?: string
    draftSlug?: string | null
    draftTitle?: string
    dirtyLocales?: string[]
    parentEntryId?: string | null
    routeBacked?: boolean
    stableId?: string | null
    draftData?: Record<string, unknown>
    publishedData?: Record<string, unknown>
  },
) {
  const now = Date.now()
  const hasDraftTitle = Object.hasOwn(input, 'draftTitle')
  const routeBacked = input.routeBacked !== false
  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId: input.collectionId,
      baseSlug: input.slug,
      stableId: input.stableId ?? null,
      status: 'published',
      dirtyLocales: input.dirtyLocales ?? [],
      parentEntryId: input.parentEntryId ?? null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: 'owner-1',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    } as never,
  )
  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: null,
      baseRevisionId: null,
      parentEntryId: input.parentEntryId ?? null,
      orderRank: 'a0',
      slug: input.draftSlug === undefined ? input.slug : input.draftSlug,
      shared: input.draftData ?? {},
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )
  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: input.locale,
      baseRevisionId: null,
      localeSlug: input.draftSlug === undefined ? input.slug : input.draftSlug,
      values:
        input.draftData ??
        (hasDraftTitle
          ? input.draftTitle
            ? { title: input.draftTitle }
            : {}
          : input.title
            ? { title: input.title }
            : {}),
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )
  const revisionId = await ctx.seed(
    'entryRevisions' as never,
    {
      entryId,
      collectionId: input.collectionId,
      parentRevisionId: null,
      kind: 'publish',
      snapshot: {
        parentEntryId: input.parentEntryId ?? null,
        orderRank: 'a0',
        slug: input.slug,
        shared: input.publishedData ?? {},
        locales: {
          [input.locale]: {
            slug: input.slug,
            path: input.path,
            values: input.publishedData ?? (input.title ? { title: input.title } : {}),
          },
        },
      },
      affectedLocales: [input.locale],
      message: null,
      createdBy: 'owner-1',
      createdAt: now,
    } as never,
  )
  await ctx.seed(
    'publicEntries' as never,
    {
      entryId,
      revisionId,
      collectionId: input.collectionId,
      locale: input.locale,
      slug: input.slug,
      path: input.path,
      href: input.href ?? input.path,
      title: input.title ?? input.slug,
      description: null,
      data: input.publishedData ?? (input.title ? { title: input.title } : {}),
      parentEntryId: input.parentEntryId ?? null,
      orderKey: `a0\u0000${entryId}`,
      cacheTags: [`entry:${entryId}`],
      assetFacts: [],
      navIncluded: true,
      entryCreatedAt: now,
      firstPublishedAt: now,
      lastPublishedAt: now,
    } as never,
  )
  if (routeBacked) {
    await ctx.seed(
      'publicRoutes' as never,
      {
        entryId,
        revisionId,
        collectionId: input.collectionId,
        locale: input.locale,
        path: input.path,
        href: input.href ?? input.path,
      } as never,
    )
  }
  return entryId as string
}

async function seedDraftEntry(
  ctx: ReturnType<typeof createCtx>,
  input: {
    collectionId: string
    slug: string
    locales?: Array<{
      locale: string
      values?: Record<string, unknown>
      bodyMdc?: string
      localeSlug?: string | null
    }>
    shared?: Record<string, unknown>
    dirtyLocales?: string[]
    parentEntryId?: string | null
  },
) {
  const now = Date.now()
  const locales = input.locales ?? []
  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId: input.collectionId,
      baseSlug: input.slug,
      stableId: null,
      status: 'draft',
      dirtyLocales: input.dirtyLocales ?? locales.map((row) => row.locale),
      parentEntryId: input.parentEntryId ?? null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    } as never,
  )

  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: null,
      baseRevisionId: null,
      parentEntryId: input.parentEntryId ?? null,
      orderRank: 'a0',
      slug: input.slug,
      shared: input.shared ?? {},
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )

  for (const row of locales) {
    await ctx.seed(
      'entryDrafts' as never,
      {
        entryId,
        locale: row.locale,
        baseRevisionId: null,
        localeSlug: row.localeSlug === undefined ? input.slug : row.localeSlug,
        values: row.values ?? {},
        bodyMdc: row.bodyMdc ?? '',
        updatedBy: 'owner-1',
        updatedAt: now,
      } as never,
    )
  }

  return entryId as string
}

async function seedPendingPublishReview(
  ctx: ReturnType<typeof createCtx>,
  input: { entryId: string; locales: string[]; expectedVersion?: number },
) {
  const apiKeyId = `readiness-review-${input.entryId}`
  await ctx.seed(
    'mcpCredentialSettings' as never,
    {
      apiKeyId,
      ownerUserId: 'owner-1',
      label: 'readiness review fixture',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
      revokedAt: null,
    } as never,
  )
  const agent = ctx.asMcpApiKey(apiKeyId, 'owner-1')
  const agentRun = await agent.mutation(api.agentRuns.startRun, {
    taskName: 'Readiness review fixture',
  })
  const review = await agent.mutation(api.reviewRequests.requestPublishReview, {
    agentRunId: agentRun._id,
    entryId: input.entryId,
    expectedVersion: input.expectedVersion ?? 1,
    locales: input.locales,
    title: 'Publish readiness fixture',
    summary: 'Fixture pending review.',
  })
  return review._id as string
}

async function readEntryReadinessDetail(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  entryId: string,
) {
  return await owner.query(api.editor.getEntryReadinessDetail, { entryId })
}

function getReadinessLocale(
  detail: { locales: Array<Record<string, unknown> & { locale?: unknown }> },
  locale: string,
) {
  const row = detail.locales.find((item) => item.locale === locale)
  expect(row).toBeTruthy()
  return row as Record<string, unknown> & { locale: string }
}

describe('public visibility diagnostics', () => {
  it('uses configured default locale when validating rendered href collisions', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx, [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch', isDefault: true },
    ])
    const collectionId = (await seedCollection(ctx, {
      slug: 'pages',
      locales: ['en', 'de'],
      pathPrefix: '',
    })) as string

    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'en',
      slug: 'english-de-path',
      path: '/de/foo',
      href: '/en/de/foo',
      title: 'English',
    })
    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'de',
      slug: 'german-root-path',
      path: '/foo',
      href: '/foo',
      title: 'Deutsch',
    })

    const owner = ctx.asCmsUser('owner-1')
    const diagnostics = await owner.query(api.diagnostics.validatePublicRoutes, {})

    expect(diagnostics).toEqual([])
  })

  it('preserves collision claims in entry visibility diagnostics', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx, [
      { code: 'en', label: 'English', isDefault: true },
      { code: 'de', label: 'Deutsch' },
    ])
    const collectionId = (await seedCollection(ctx, {
      slug: 'pages',
      locales: ['en', 'de'],
      pathPrefix: '',
    })) as string
    const enEntryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'en',
      slug: 'english-de-path',
      path: '/de/foo',
      title: 'English',
    })
    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'de',
      slug: 'german-root-path',
      path: '/foo',
      href: '/de/foo',
      title: 'Deutsch',
    })

    const owner = ctx.asCmsUser('owner-1')
    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'pages',
      entryId: enEntryId,
      locale: 'en',
    })
    const collision = explanation.diagnostics.find(
      (diagnostic: { code: string }) => diagnostic.code === 'route_collision',
    )

    expect(explanation.locales[0]?.status).toBe('collision')
    expect(collision?.details?.claims).toHaveLength(2)
  })

  it('reports required-field warnings for data-only collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'authors',
      mode: 'none',
      pathPrefix: '',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'authors',
      locale: 'en',
      slug: 'missing-title',
      path: '/authors/missing-title',
      routeBacked: false,
    })

    const owner = ctx.asCmsUser('owner-1')
    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'authors',
      entryId,
    })

    expect(
      explanation.diagnostics.map((diagnostic: { code: string }) => diagnostic.code),
    ).toContain('data_only_collection')
    expect(
      explanation.diagnostics.map((diagnostic: { code: string }) => diagnostic.code),
    ).toContain('missing_required_localized_field')
  })

  it('reports nested broken relation diagnostics with field paths', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const authorCollectionId = (await seedCollection(ctx, {
      slug: 'authors',
      mode: 'none',
      pathPrefix: '',
    })) as string
    await seedPublishedEntry(ctx, {
      collectionId: authorCollectionId,
      collection: 'authors',
      locale: 'en',
      slug: 'ada',
      path: '/authors/ada',
      stableId: 'ada',
      routeBacked: false,
      publishedData: { title: 'Ada' },
    })
    const pageCollectionId = (await seedCollection(ctx, {
      slug: 'pages',
      pathPrefix: '/pages',
      fields: [
        { key: 'title', type: 'text', localized: true, required: true, searchable: true },
        {
          key: 'hero',
          type: 'object',
          fields: [
            {
              key: 'author',
              type: 'relation',
              relation: { collectionId: 'authors' },
            },
          ],
        },
        {
          key: 'sections',
          type: 'blocks',
          fields: [
            {
              key: 'cta',
              type: 'object',
              fields: [
                {
                  key: 'author',
                  type: 'relation',
                  relation: { collectionId: 'authors' },
                },
              ],
            },
          ],
        },
      ],
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId: pageCollectionId,
      collection: 'pages',
      locale: 'en',
      slug: 'team',
      path: '/pages/team',
      title: 'Team',
      publishedData: {
        title: 'Team',
        hero: { author: 'missing-author' },
        sections: [{ type: 'cta', data: { author: 'missing-block-author' } }],
      },
    })

    const owner = ctx.asCmsUser('owner-1')
    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'pages',
      entryId,
      locale: 'en',
    })
    const relationDiagnostics = explanation.diagnostics.filter(
      (diagnostic: { code: string }) => diagnostic.code === 'broken_relation',
    )

    expect(
      relationDiagnostics.map(
        (item: { details: { relationField?: string } }) => item.details.relationField,
      ),
    ).toEqual(expect.arrayContaining(['hero.author', 'sections.0.cta.author']))
    expect(
      relationDiagnostics.map((item: { details: { targetId?: string } }) => item.details.targetId),
    ).toEqual(expect.arrayContaining(['missing-author', 'missing-block-author']))
  })

  it('uses collection slugs for manual redirect route diagnostics', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'pages',
      pathPrefix: '/pages',
    })) as string
    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'en',
      slug: 'foo',
      path: '/pages/foo',
      title: 'Foo',
    })
    await ctx.seed(
      'redirects' as never,
      {
        locale: 'en',
        from: '/pages/foo',
        to: '/pages/bar',
        statusCode: 301,
        source: 'manual',
        collectionId,
        entryId: null,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const diagnostics = await owner.query(api.diagnostics.validatePublicRoutes, {})
    const collision = diagnostics.find((diagnostic: { claims: Array<{ kind: string }> }) =>
      diagnostic.claims.some((claim) => claim.kind === 'redirect'),
    )

    expect(collision?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'redirect',
          collection: 'pages',
          path: '/pages/foo',
          targetPath: '/pages/bar',
        }),
      ]),
    )
  })

  it('previews route, cache, and webhook impact for a dirty draft without promising redirects for shared slugs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'old-slug',
      path: '/posts/old-slug',
      title: 'Old title',
      draftSlug: 'new-slug',
      draftTitle: 'New title',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'posts',
      entryId,
      locale: 'en',
    })

    expect(preview.status).toBe('ready')
    expect(preview.locales[0]?.nextHref).toBe('/posts/new-slug')
    expect(preview.changes.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(['route', 'seo']),
    )
    expect(preview.changes.map((item: { kind: string }) => item.kind)).not.toContain('redirect')
    expect(preview.cacheTags).toEqual(
      expect.arrayContaining(['collection:posts', `entry:posts:${entryId}:en`, 'sitemap']),
    )
    expect(preview.events).toContain('entry.published')
  })

  it('previews an old-route redirect only for stable slug collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'wiki',
      pathPrefix: '/wiki',
      slugMode: 'stable',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'wiki',
      locale: 'en',
      slug: 'old-slug-stable-1',
      path: '/wiki/old-slug-stable-1',
      title: 'Old title',
      draftSlug: 'new-slug',
      draftTitle: 'New title',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'wiki',
      entryId,
      locale: 'en',
    })

    expect(preview.status).toBe('ready')
    expect(preview.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'redirect',
          label: 'Old route redirect',
          before: '/wiki/old-slug-stable-1',
          after: '/wiki/new-slug',
        }),
      ]),
    )
  })

  it('blocks publish impact when required draft fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'missing-title',
      path: '/posts/missing-title',
      title: 'Published title',
      draftTitle: '',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'posts',
      entryId,
      locale: 'en',
    })

    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'missing_required_localized_field',
    )
  })

  it('blocks publish impact when a draft route would collide', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
    })) as string
    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'taken',
      path: '/posts/taken',
      title: 'Taken',
    })
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'old',
      path: '/posts/old',
      title: 'Old',
      draftSlug: 'taken',
      draftTitle: 'Old',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'posts',
      entryId,
      locale: 'en',
    })

    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'route_collision',
    )
  })

  it('blocks data-only publish impact when required fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'authors',
      mode: 'none',
      pathPrefix: '',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'authors',
      locale: 'en',
      slug: 'author',
      path: '/authors/author',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'authors',
      entryId,
      locale: 'en',
    })

    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'missing_required_localized_field',
    )
    expect(preview.warnings.map((item: { code: string }) => item.code)).toContain(
      'data_only_collection',
    )
    expect(preview.warnings.map((item: { message: string }) => item.message).join('\n')).toContain(
      'updates listable public data',
    )
  })

  it('reports no changes for unchanged live data-only publish impact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'authors',
      mode: 'none',
      pathPrefix: '',
      fields: [{ key: 'name', type: 'text', localized: true, required: false }],
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'authors',
      locale: 'en',
      slug: 'author',
      path: '/authors/author',
      title: 'Author',
      routeBacked: false,
      dirtyLocales: [],
      draftData: { name: 'Author' },
      publishedData: { name: 'Author' },
    })

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'authors',
      entryId,
      locale: 'en',
    })
    const readiness = await owner.query(api.editor.getEntryReadinessDetail, { entryId })
    const locale = readiness.locales.find((row: { locale: string }) => row.locale === 'en')

    expect(preview.status).toBe('no_changes')
    expect(preview.locales[0]).toMatchObject({ locale: 'en', status: 'no_changes' })
    expect(locale).toMatchObject({ state: 'live', canPublish: false })
  })

  it('returns a structured invalid entry diagnostic for publish impact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'posts',
      entryId: 'not-an-entry-id',
      locale: 'en',
    })

    expect(preview.status).toBe('not_publishable')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'invalid_entry_id',
    )
  })

  it('rejects publish execution without a CMS confirmation token', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
    })) as string
    const entryId = await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'post',
      path: '/posts/post',
      title: 'Post',
      draftTitle: 'Updated post',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        entryId,
        locales: ['en'],
        expectedVersion: 1,
      }),
    ).rejects.toThrow(/requires confirmation/i)
  })
})

describe('entry readiness detail', () => {
  it('returns configured missing locales without blocking a ready primary locale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx, [
      { code: 'de', label: 'Deutsch', isDefault: true },
      { code: 'en', label: 'English', fallback: 'de' },
      { code: 'fr', label: 'Francais', fallback: 'de' },
    ])
    const collectionId = (await seedCollection(ctx, {
      slug: 'pages',
      locales: ['de', 'en', 'fr'],
      pathPrefix: '',
    })) as string
    const entryId = await seedDraftEntry(ctx, {
      collectionId,
      slug: 'willkommen',
      locales: [{ locale: 'de', values: { title: 'Willkommen' } }],
    })

    const owner = ctx.asCmsUser('owner-1')
    const detail = await readEntryReadinessDetail(owner, entryId)
    const de = getReadinessLocale(detail, 'de')
    const en = getReadinessLocale(detail, 'en')
    const fr = getReadinessLocale(detail, 'fr')

    expect(detail).toMatchObject({
      entryId,
      collection: 'pages',
      primaryLocale: 'de',
    })
    expect(detail.locales.map((row: { locale: string }) => row.locale)).toEqual(['de', 'en', 'fr'])
    expect(de).toMatchObject({
      state: 'ready',
      draftExists: true,
      published: false,
      hasUnpublishedChanges: true,
      blockers: [],
      canPreview: true,
      canPublish: true,
    })
    expect(en).toMatchObject({
      state: 'missing',
      draftExists: false,
      published: false,
      hasUnpublishedChanges: false,
      canPublish: false,
    })
    expect(fr).toMatchObject({
      state: 'missing',
      draftExists: false,
      published: false,
      hasUnpublishedChanges: false,
      canPublish: false,
    })
    expect(de.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'locale_missing' })]),
    )
  })

  it('derives draft, in-review, live, and live-with-changes states from canonical rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const noteCollectionId = (await seedCollection(ctx, {
      slug: 'notes',
      mode: 'none',
      fields: [{ key: 'note', type: 'text', localized: true, required: false }],
    })) as string
    const pageCollectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
    })) as string
    const draftEntryId = await seedDraftEntry(ctx, {
      collectionId: noteCollectionId,
      slug: 'empty-note',
      locales: [{ locale: 'en', values: {} }],
    })
    const reviewEntryId = await seedDraftEntry(ctx, {
      collectionId: pageCollectionId,
      slug: 'review-me',
      locales: [{ locale: 'en', values: { title: 'Review me' } }],
    })
    const reviewRequestId = await seedPendingPublishReview(ctx, {
      entryId: reviewEntryId,
      locales: ['en'],
    })
    const liveEntryId = await seedPublishedEntry(ctx, {
      collectionId: pageCollectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'live-post',
      path: '/posts/live-post',
      title: 'Live post',
    })
    const changedEntryId = await seedPublishedEntry(ctx, {
      collectionId: pageCollectionId,
      collection: 'posts',
      locale: 'en',
      slug: 'changed-post',
      path: '/posts/changed-post',
      title: 'Published title',
      draftTitle: 'Updated draft title',
      dirtyLocales: ['en'],
    })

    const owner = ctx.asCmsUser('owner-1')
    const draft = getReadinessLocale(await readEntryReadinessDetail(owner, draftEntryId), 'en')
    const inReview = getReadinessLocale(await readEntryReadinessDetail(owner, reviewEntryId), 'en')
    const live = getReadinessLocale(await readEntryReadinessDetail(owner, liveEntryId), 'en')
    const liveWithChanges = getReadinessLocale(
      await readEntryReadinessDetail(owner, changedEntryId),
      'en',
    )

    expect(draft).toMatchObject({
      state: 'draft',
      draftExists: true,
      published: false,
      hasUnpublishedChanges: true,
      blockers: [],
      canPreview: true,
      canPublish: false,
      publicUrl: null,
    })
    expect(inReview).toMatchObject({
      state: 'in_review',
      draftExists: true,
      published: false,
      hasUnpublishedChanges: true,
      blockers: [],
      reviewRequestId,
      canRequestReview: false,
    })
    expect(live).toMatchObject({
      state: 'live',
      draftExists: true,
      published: true,
      hasUnpublishedChanges: false,
      publicUrl: '/posts/live-post',
      canPublish: false,
    })
    expect(liveWithChanges).toMatchObject({
      state: 'live_with_changes',
      draftExists: true,
      published: true,
      hasUnpublishedChanges: true,
      publicUrl: '/posts/changed-post',
      canPublish: true,
    })
    expect(liveWithChanges.affectedPublicUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: changedEntryId,
          locale: 'en',
          kind: 'current_entry',
          beforeHref: '/posts/changed-post',
        }),
      ]),
    )
  })

  it('does not show an outdated review as in review after route context changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    const reviewRequestId = await seedPendingPublishReview(ctx, {
      entryId: childId,
      locales: ['en'],
    })

    const root = await owner.query(api.editor.getEntry, { id: rootAId, locale: 'en' })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: root.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })
    await publishEntry(owner, rootAId)

    const en = getReadinessLocale(await readEntryReadinessDetail(owner, childId), 'en')

    expect(reviewRequestId).toBeTruthy()
    expect(en).toMatchObject({
      state: 'ready',
      draftExists: true,
      published: false,
      hasUnpublishedChanges: true,
      reviewRequestId: null,
      canPublish: true,
      nextAction: expect.objectContaining({
        kind: 'publish_locale',
        locale: 'en',
      }),
    })
    expect(en.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'review_preview_stale',
          severity: 'warning',
          locale: 'en',
        }),
      ]),
    )
  })

  it('derives stale published asset metadata from the active projection', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'gallery',
      pathPrefix: '/gallery',
      fields: [
        { key: 'title', type: 'text', localized: true, required: true, searchable: true },
        {
          key: 'image',
          type: 'object',
          localized: false,
          fields: [
            { key: 'src', type: 'image' },
            { key: 'alt', type: 'text' },
            { key: 'caption', type: 'text' },
          ],
        },
      ],
    })) as string
    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 1024,
        width: 800,
        height: 600,
        alt: { en: 'Original asset alt' },
        caption: { en: 'Original asset caption' },
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'gallery',
      slug: 'asset-snapshot',
      localized: { title: 'Asset snapshot' },
      shared: { image: { src: assetId, alt: '', caption: '' } },
    })
    await publishEntry(owner, entryId)

    await owner.mutation(api.assets.updateAsset, {
      assetId,
      alt: { en: 'Updated asset alt' },
      caption: { en: 'Updated asset caption' },
    })

    const locale = getReadinessLocale(await readEntryReadinessDetail(owner, entryId), 'en')

    expect(locale).toMatchObject({
      state: 'live_with_changes',
      published: true,
      hasUnpublishedChanges: true,
      canPublish: true,
    })
    expect(locale.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'asset_metadata_stale',
          locale: 'en',
          severity: 'warning',
        }),
      ]),
    )
  })

  it('allows incomplete draft saves but blocks readiness for missing required fields', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'posts',
      pathPrefix: '/posts',
      fields: [
        { key: 'title', type: 'text', localized: true, required: true },
        { key: 'summary', type: 'textarea', localized: true, required: true },
        { key: 'featuredLabel', type: 'text', localized: false, required: true },
      ],
    })) as string
    const entryId = await seedDraftEntry(ctx, {
      collectionId,
      slug: 'missing-required',
      locales: [{ locale: 'en', values: { title: 'Partial draft' } }],
    })

    const owner = ctx.asCmsUser('owner-1')
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: {
          locales: {
            en: {
              values: {
                title: 'Still partial',
              },
            },
          },
        },
      }),
    ).resolves.toMatchObject({ draftVersion: 2, dirtyLocales: ['en'] })

    const en = getReadinessLocale(await readEntryReadinessDetail(owner, entryId), 'en')

    expect(en).toMatchObject({
      state: 'needs_work',
      draftExists: true,
      published: false,
      canPreview: true,
      canPublish: false,
    })
    expect(en.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required_localized_field_missing',
          severity: 'blocker',
          locale: 'en',
          fieldPath: 'summary',
        }),
        expect.objectContaining({
          code: 'required_shared_field_missing',
          severity: 'blocker',
          locale: null,
          fieldPath: 'featuredLabel',
        }),
      ]),
    )
  })

  it('blocks data-only publish readiness when required fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const collectionId = (await seedCollection(ctx, {
      slug: 'authors',
      mode: 'none',
      fields: [{ key: 'name', type: 'text', localized: true, required: true }],
    })) as string
    const entryId = await seedDraftEntry(ctx, {
      collectionId,
      slug: 'empty-author',
      locales: [{ locale: 'en', values: {} }],
    })

    const owner = ctx.asCmsUser('owner-1')
    const en = getReadinessLocale(await readEntryReadinessDetail(owner, entryId), 'en')

    expect(en).toMatchObject({
      state: 'needs_work',
      draftExists: true,
      published: false,
      canPreview: true,
      canPublish: false,
      publicUrl: null,
      draftUrl: null,
    })
    expect(en.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'data_only_required_field_missing',
          severity: 'blocker',
          locale: 'en',
          fieldPath: 'name',
        }),
      ]),
    )
    expect(en.warnings ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'data_only_required_field_missing',
        }),
      ]),
    )
  })
})
