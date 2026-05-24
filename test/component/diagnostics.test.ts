/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner } from './entries/helpers'

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
      href: input.path,
      title: input.title ?? input.slug,
      description: null,
      data: input.publishedData ?? (input.title ? { title: input.title } : {}),
      parentEntryId: input.parentEntryId ?? null,
      orderKey: `a0\u0000${entryId}`,
      cacheTags: [`entry:${entryId}`],
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
        href: input.path,
      } as never,
    )
  }
  return entryId as string
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
      title: 'English',
    })
    await seedPublishedEntry(ctx, {
      collectionId,
      collection: 'pages',
      locale: 'de',
      slug: 'german-root-path',
      path: '/foo',
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

  it('returns ready impact with route-output warnings for data-only collections', async () => {
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

    expect(preview.status).toBe('ready')
    expect(preview.warnings.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining(['data_only_collection', 'missing_required_localized_field']),
    )
    expect(preview.warnings.map((item: { message: string }) => item.message).join('\n')).toContain(
      'updates listable public data',
    )
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

  it('rejects publish execution without a Trellis confirmation token', async () => {
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
