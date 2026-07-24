/// <reference types="vite/client" />

import type { ginkoPublishImpactResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type BuildResolvedContentContractInput,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  currentDraftVersion,
  previewPublishEntryWithArgs,
  publishEntry,
  seedOwner,
  seedMcpCredential,
  seedSettings,
  seedStorageObject,
  seedTreeFixture,
} from './entries/helpers'

const api = anyApi
type TestCtx = ReturnType<typeof createCtx>
type CmsUser = ReturnType<TestCtx['asCmsUser']>

async function previewPublishImpact(owner: CmsUser, entryId: string, locale = 'en') {
  const preview = await previewPublishEntryWithArgs(owner, {
    entryId,
    expectedVersion: await currentDraftVersion(owner, entryId),
    locales: [locale],
  })
  return (preview.details as { publishImpact: typeof ginkoPublishImpactResultValidator.type })
    .publishImpact
}

async function installDiagnosticsContract(
  ctx: TestCtx,
  options: { locales?: string[]; defaultLocale?: string } = {},
) {
  const locales = options.locales ?? ['en']
  const defaultLocale = options.defaultLocale ?? locales[0] ?? 'en'
  const i18n = { defaultLocale, locales }
  const titleField = {
    type: 'text' as const,
    localized: true,
    required: true,
    searchable: true,
  }
  const collections = {
    posts: {
      type: 'page',
      source: 'content/posts/**/*.md',
      i18n,
      route: '/posts',
      cms: { type: 'flat', fields: { title: titleField } },
    },
    pages: {
      type: 'page',
      source: 'content/pages/**/*.md',
      i18n,
      route: '/pages',
      cms: {
        type: 'tree',
        route: {
          pathPrefix: '',
          slugMode: 'localized',
          allowMultipleRoots: true,
        },
        fields: { title: titleField },
      },
    },
    articles: {
      type: 'page',
      source: 'content/articles/**/*.md',
      i18n,
      route: '/pages',
      cms: {
        type: 'flat',
        fields: {
          title: titleField,
          hero: {
            type: 'object',
            localized: false,
            fields: {
              author: {
                type: 'relation',
                localized: false,
                relation: { collectionId: 'authors' },
              },
            },
          },
          sections: {
            type: 'blocks',
            localized: false,
            fields: {
              cta: {
                type: 'object',
                fields: {
                  author: {
                    type: 'relation',
                    localized: false,
                    relation: { collectionId: 'authors' },
                  },
                },
              },
            },
          },
        },
      },
    },
    wiki: {
      type: 'page',
      source: 'content/wiki/**/*.md',
      i18n,
      route: '/wiki',
      cms: {
        type: 'flat',
        route: { slugMode: 'stable' },
        fields: { title: titleField },
      },
    },
    strictPosts: {
      type: 'page',
      source: 'content/strict-posts/**/*.md',
      i18n,
      route: '/strict-posts',
      cms: {
        type: 'flat',
        fields: {
          title: titleField,
          summary: { type: 'textarea', localized: true, required: true },
          featuredLabel: { type: 'text', localized: false, required: true },
        },
      },
    },
    gallery: {
      type: 'page',
      source: 'content/gallery/**/*.md',
      i18n,
      route: '/gallery',
      cms: {
        type: 'flat',
        fields: {
          title: titleField,
          image: {
            type: 'object',
            localized: false,
            fields: {
              src: { type: 'image', localized: false },
              alt: { type: 'text', localized: false },
              caption: { type: 'text', localized: false },
            },
          },
        },
      },
    },
    authors: {
      type: 'data',
      source: 'content/authors/**/*.json',
      i18n,
      cms: {
        type: 'flat',
        route: { mode: 'none', pathPrefix: '' },
        fields: {
          name: { type: 'text', localized: true, required: true },
        },
      },
    },
    notes: {
      type: 'data',
      source: 'content/notes/**/*.json',
      i18n,
      cms: {
        type: 'flat',
        route: { mode: 'none', pathPrefix: '' },
        fields: {
          note: { type: 'text', localized: true, required: false },
        },
      },
    },
  } satisfies NonNullable<BuildResolvedContentContractInput['collections']>
  const contract = buildResolvedContentContract(
    { collections },
    {
      defaultLocale,
      locales,
      localeFallbacks: Object.fromEntries(
        locales.map((locale) => [locale, locale === defaultLocale ? [] : [defaultLocale]]),
      ),
    },
  )
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash: await hashCanonicalJson(contract),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

async function seedPendingPublishReview(
  ctx: TestCtx,
  input: { entryId: string; locales: string[]; expectedVersion?: number },
) {
  const apiKeyId = `readiness-review-${input.entryId}`
  const owner = ctx.asCmsUser('owner-1')
  await seedMcpCredential(ctx, {
    apiKeyId,
    ownerUserId: 'owner-1',
    scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
  })
  const agent = ctx.asMcpApiKey(apiKeyId, 'owner-1')
  const agentRun = await agent.mutation(api.agentRuns.startRun, {
    taskName: 'Readiness review fixture',
  })
  const review = await agent.mutation(api.reviewRequests.requestPublishReview, {
    agentRunId: agentRun._id,
    operationKey: crypto.randomUUID(),
    entryId: input.entryId,
    expectedVersion: input.expectedVersion ?? (await currentDraftVersion(owner, input.entryId)),
    locales: input.locales,
    title: 'Publish readiness fixture',
    summary: 'Fixture pending review.',
  })
  return review._id as string
}

async function readEntryReadinessDetail(owner: CmsUser, entryId: string) {
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

async function patchPublicSlug(ctx: TestCtx, entryId: string, locale: string, slug: string) {
  await ctx.raw.run(async (innerCtx) => {
    const id = innerCtx.db.normalizeId('entries', entryId)
    if (!id) throw new Error('Invalid entry fixture id')
    const row = await innerCtx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', id).eq('locale', locale))
      .unique()
    if (!row) throw new Error('Missing public entry fixture')
    await innerCtx.db.patch(row._id, { slug })
  })
}

async function corruptDraftSlug(ctx: TestCtx, entryId: string, slug: string) {
  await ctx.raw.run(async (innerCtx) => {
    const id = innerCtx.db.normalizeId('entries', entryId)
    if (!id) throw new Error('Invalid entry fixture id')
    const entry = await innerCtx.db.get(id)
    if (!entry) throw new Error('Missing entry fixture')
    await innerCtx.db.patch(id, {
      slug,
      draftVersion: entry.draftVersion + 1,
      sharedVersion: entry.sharedVersion + 1,
      updatedAt: Date.now(),
    })
  })
}

describe('public visibility diagnostics', () => {
  it('uses the installed default locale when validating rendered href collisions', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx, { locales: ['en', 'de'], defaultLocale: 'de' })
    const owner = ctx.asCmsUser('owner-1')
    const englishRootId = await owner.createEntry({
      collection: 'pages',
      locale: 'en',
      slug: 'de',
      localized: { title: 'English root' },
    })
    await publishEntry(owner, englishRootId, ['en'])
    const englishChildId = await owner.createEntry({
      collection: 'pages',
      locale: 'en',
      parentEntryId: englishRootId,
      slug: 'foo',
      localized: { title: 'English child' },
    })
    await publishEntry(owner, englishChildId, ['en'])
    const germanId = await owner.createEntry({
      collection: 'pages',
      locale: 'de',
      slug: 'foo',
      localized: { title: 'Deutsch' },
    })
    await publishEntry(owner, germanId, ['de'])

    const [english, german] = await Promise.all([
      owner.query(api.diagnostics.explainPublicVisibility, {
        collection: 'pages',
        entryId: englishChildId,
        locale: 'en',
      }),
      owner.query(api.diagnostics.explainPublicVisibility, {
        collection: 'pages',
        entryId: germanId,
        locale: 'de',
      }),
    ])
    expect(
      [...english.diagnostics, ...german.diagnostics].filter(
        (item: { code: string }) => item.code === 'route_collision',
      ),
    ).toEqual([])
  })

  it('preserves both canonical claims when explaining a corrupted route collision', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx, { locales: ['en', 'de'], defaultLocale: 'en' })
    const owner = ctx.asCmsUser('owner-1')
    const englishRootId = await owner.createEntry({
      collection: 'pages',
      locale: 'en',
      slug: 'de',
      localized: { title: 'English root' },
    })
    await publishEntry(owner, englishRootId, ['en'])
    const englishChildId = await owner.createEntry({
      collection: 'pages',
      locale: 'en',
      parentEntryId: englishRootId,
      slug: 'foo',
      localized: { title: 'English child' },
    })
    await publishEntry(owner, englishChildId, ['en'])
    const germanId = await owner.createEntry({
      collection: 'pages',
      locale: 'de',
      slug: 'bar',
      localized: { title: 'Deutsch' },
    })
    await publishEntry(owner, germanId, ['de'])
    await patchPublicSlug(ctx, germanId, 'de', 'foo')

    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'pages',
      entryId: englishChildId,
      locale: 'en',
    })
    const collision = explanation.diagnostics.find(
      (diagnostic: { code: string }) => diagnostic.code === 'route_collision',
    )
    expect(explanation.locales[0]?.status).toBe('collision')
    expect(collision?.details?.claims).toHaveLength(2)
  })

  it('reports required-field warnings for a data-only draft', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'missing-name',
      localized: {},
    })

    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'authors',
      entryId,
    })
    const codes = explanation.diagnostics.map((diagnostic: { code: string }) => diagnostic.code)
    expect(codes).toContain('data_only_collection')
    expect(codes).toContain('missing_required_localized_field')
  })

  it('reports nested broken relations with exact field paths and stable target ids', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.createEntry({
      collection: 'authors',
      slug: 'ada',
      localized: { name: 'Ada' },
    })
    const entryId = await owner.createEntry({
      collection: 'articles',
      slug: 'team',
      localized: { title: 'Team' },
      shared: {
        hero: { author: 'missing-author' },
        sections: [{ type: 'cta', data: { author: 'missing-block-author' } }],
      },
    })
    await publishEntry(owner, entryId)

    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'articles',
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

  it('uses collection slugs and target entries for manual redirect diagnostics', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sourceId = await owner.createEntry({
      collection: 'posts',
      slug: 'foo',
      localized: { title: 'Foo' },
    })
    await publishEntry(owner, sourceId)
    const targetId = await owner.createEntry({
      collection: 'posts',
      slug: 'bar',
      localized: { title: 'Bar' },
    })
    await publishEntry(owner, targetId)
    const now = Date.now()
    await ctx.seed('redirects', {
      redirectId: 'diagnostics-fixture:en:/posts/foo',
      collection: 'posts',
      locale: 'en',
      kind: 'exact',
      fromPath: '/posts/foo',
      targetEntryId: targetId,
      state: 'active',
      statusCode: 301,
      source: 'manual',
      operationId: 'diagnostics-fixture',
      createdBy: 'owner-1',
      createdAt: now,
      retiredBy: null,
      retiredAt: null,
      updatedAt: now,
    })

    const explanation = await owner.query(api.diagnostics.explainPublicVisibility, {
      collection: 'posts',
      entryId: sourceId,
      locale: 'en',
    })
    const collision = explanation.diagnostics.find(
      (diagnostic: { details?: { claims?: Array<{ kind: string }> } }) =>
        diagnostic.details?.claims?.some((claim) => claim.kind === 'redirect'),
    )
    expect(collision?.details?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'redirect',
          collection: 'posts',
          path: '/posts/foo',
          targetPath: '/posts/bar',
        }),
      ]),
    )
  })

  it('[EDT-07][PUB-02] previews route, redirect, SEO, cache, and event impact from one canonical draft without public writes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'old-slug',
      localized: { title: 'Old title' },
    })
    await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        shared: { slug: 'new-slug' },
        locales: { en: { values: { title: 'New title' } } },
      },
    })
    const publicBeforePreview = structuredClone(await ctx.readAll('publicEntries'))
    const revisionsBeforePreview = structuredClone(await ctx.readAll('entryRevisions'))
    const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })

    const preview = await previewPublishImpact(owner, entryId)
    expect(preview.status).toBe('ready')
    expect(preview.locales[0]?.nextHref).toBe('/posts/new-slug')
    expect(preview.changes.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(['route', 'redirect', 'seo']),
    )
    expect(preview.cacheTags).toEqual(
      expect.arrayContaining(['collection:posts', `entry:posts:${entry.stableId}:en`, 'sitemap']),
    )
    expect(preview.events).toContain('entry.published')
    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforePreview)
    expect(await ctx.readAll('entryRevisions')).toEqual(revisionsBeforePreview)
  })

  it('pages a large descendant URL impact without losing or duplicating routes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const rootId = await owner.createEntry({
      collection: 'pages',
      slug: 'before',
      localized: { title: 'Root' },
    })
    await publishEntry(owner, rootId)
    for (let index = 0; index < 26; index += 1) {
      const childId = await owner.createEntry({
        collection: 'pages',
        parentEntryId: rootId,
        slug: `child-${String(index).padStart(2, '0')}`,
        localized: { title: `Child ${index}` },
      })
      await publishEntry(owner, childId)
    }
    await owner.saveEntryDraft({
      entryId: rootId,
      expectedDraftVersion: await currentDraftVersion(owner, rootId),
      patch: { locales: { en: { slug: 'after' } } },
    })

    const operationPreview = await previewPublishEntryWithArgs(owner, {
      entryId: rootId,
      expectedVersion: await currentDraftVersion(owner, rootId),
      locales: ['en'],
    })
    const preview = (
      operationPreview.details as { publishImpact: typeof ginkoPublishImpactResultValidator.type }
    ).publishImpact
    const locale = preview.locales[0]!
    expect(locale.routeImpact).toMatchObject({
      // Exact total stays unknown until the generation-fenced traversal ends.
      total: null,
      listed: 25,
      hasMore: true,
      routeGeneration: expect.any(Number),
      impactHash: expect.stringMatching(/^routes:/),
    })
    const inlineChanges = locale.changes.filter(
      (change: { scope?: string }) => change.scope === 'descendant',
    )
    expect(inlineChanges).toHaveLength(25)
    for (const kind of ['routes', 'changes']) {
      const effect = (
        operationPreview.effects as Array<{
          kind: string
          count?: number | null
          minimumCount?: number
          countLabel?: string
        }>
      ).find((candidate) => candidate.kind === kind)!
      expect(effect.count).toBeNull()
      expect(effect.minimumCount).toBeGreaterThanOrEqual(25)
      expect(effect.countLabel).toBe(`${effect.minimumCount}+`)
    }

    const nextPage = await owner.query(api.entries.publish.listPublishRouteImpactPage, {
      entryId: rootId,
      locale: 'en',
      expectedVersion: await currentDraftVersion(owner, rootId),
      expectedRouteGeneration: locale.routeImpact.routeGeneration,
      cursor: locale.routeImpact.continueCursor,
      limit: 25,
    })
    expect(nextPage).toMatchObject({ isDone: true, continueCursor: null })
    expect(nextPage.changes).toHaveLength(1)
    const affectedEntryIds = [...inlineChanges, ...nextPage.changes].map(
      (change: { entryId?: string }) => change.entryId,
    )
    expect(new Set(affectedEntryIds).size).toBe(26)
    expect(
      nextPage.changes.every(
        (change: { before: unknown; after: unknown }) =>
          String(change.before).includes('/before/') && String(change.after).includes('/after/'),
      ),
    ).toBe(true)

    const publishArgs = {
      entryId: rootId,
      expectedVersion: await currentDraftVersion(owner, rootId),
      locales: ['en'],
    }
    const allowedOperation = await previewPublishEntryWithArgs(owner, publishArgs)
    expect(allowedOperation).toMatchObject({
      allowed: true,
      confirmation: { token: expect.any(String) },
    })
    const revisionsBeforeCollision = (await ctx.readAll('entryRevisions')).length
    const now = Date.now()
    const exactRedirectDocId = await ctx.seed('redirects', {
      redirectId: 'redirect:descendant-exact',
      collection: 'pages',
      locale: 'en',
      kind: 'exact',
      fromPath: '/after/child-25',
      targetEntryId: rootId,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: 'test:descendant-exact',
      createdBy: 'owner-1',
      createdAt: now,
      retiredBy: null,
      retiredAt: null,
      updatedAt: now,
    })

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        ...publishArgs,
        _confirmationToken: allowedOperation.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'OPERATION_NO_LONGER_ALLOWED' })
    expect(await ctx.readAll('entryRevisions')).toHaveLength(revisionsBeforeCollision)
    expect(
      (await ctx.readAll('publicEntries')).find((row) => row.entryId === rootId),
    ).toMatchObject({
      slug: 'before',
    })

    const exactBlocked = await previewPublishImpact(owner, rootId)
    expect(exactBlocked.locales[0]?.routeImpact).toMatchObject({ listed: 25, hasMore: true })
    expect(exactBlocked.blockingDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'route_redirect_collision',
          path: '/after/child-25',
          message: expect.stringContaining('active exact redirect'),
        }),
      ]),
    )

    await ctx.raw.run(async (inner) => {
      await inner.db.patch(exactRedirectDocId as never, {
        state: 'retired',
        retiredBy: 'owner-1',
        retiredAt: now + 1,
        updatedAt: now + 1,
      })
    })
    await ctx.seed('redirects', {
      redirectId: 'redirect:descendant-prefix',
      collection: 'pages',
      locale: 'en',
      kind: 'prefix',
      fromPath: '/after/child-25',
      targetEntryId: rootId,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: 'test:descendant-prefix',
      createdBy: 'owner-1',
      createdAt: now + 2,
      retiredBy: null,
      retiredAt: null,
      updatedAt: now + 2,
    })
    const prefixBlocked = await previewPublishImpact(owner, rootId)
    expect(prefixBlocked.blockingDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'route_redirect_collision',
          path: '/after/child-25',
          message: expect.stringContaining('active prefix redirect'),
        }),
      ]),
    )

    const unrelatedId = await owner.createEntry({
      collection: 'pages',
      slug: 'unrelated',
      localized: { title: 'Unrelated' },
    })
    await publishEntry(owner, unrelatedId)
    await expect(
      owner.query(api.entries.publish.listPublishRouteImpactPage, {
        entryId: rootId,
        locale: 'en',
        expectedVersion: await currentDraftVersion(owner, rootId),
        expectedRouteGeneration: locale.routeImpact.routeGeneration,
        cursor: locale.routeImpact.continueCursor,
        limit: 25,
      }),
    ).rejects.toMatchObject({ data: expect.objectContaining({ code: 'PUBLISH_IMPACT_STALE' }) })
  }, 15_000)

  it('previews a stable-id route rename without changing entry identity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'wiki',
      slug: 'old-slug',
      localized: { title: 'Old title' },
    })
    await publishEntry(owner, entryId)
    const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: { shared: { slug: 'new-slug' } },
    })

    const preview = await previewPublishImpact(owner, entryId)
    const redirect = preview.changes.find((change: { kind: string }) => change.kind === 'redirect')
    expect(preview.status).toBe('ready')
    expect(redirect).toMatchObject({ kind: 'redirect', label: 'Old route redirect' })
    expect(redirect.before).toContain(`old-slug-${entry.stableId}`)
    expect(redirect.after).toContain(`new-slug-${entry.stableId}`)
  })

  it('blocks publish impact when required draft fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'missing-title',
      localized: { title: 'Published title' },
    })
    await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { locales: { en: { values: {} } } },
    })

    const preview = await previewPublishImpact(owner, entryId)
    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'missing_required_localized_field',
    )
  })

  it('blocks publish impact when corrupted canonical draft placement collides', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const takenId = await owner.createEntry({
      collection: 'posts',
      slug: 'taken',
      localized: { title: 'Taken' },
    })
    await publishEntry(owner, takenId)
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'old',
      localized: { title: 'Old' },
    })
    await publishEntry(owner, entryId)
    await corruptDraftSlug(ctx, entryId, 'taken')

    const preview = await previewPublishImpact(owner, entryId)
    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'route_collision',
    )
  })

  it('blocks data-only publish impact when required fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'author',
      localized: {},
    })

    const preview = await previewPublishImpact(owner, entryId)
    expect(preview.status).toBe('blocked')
    expect(preview.blockingDiagnostics.map((item: { code: string }) => item.code)).toContain(
      'missing_required_localized_field',
    )
    expect(preview.warnings.map((item: { code: string }) => item.code)).toContain(
      'data_only_collection',
    )
  })

  it('reports no changes for unchanged live data-only output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'author',
      localized: { name: 'Author' },
    })
    await publishEntry(owner, entryId)

    const preview = await previewPublishImpact(owner, entryId)
    const readiness = await readEntryReadinessDetail(owner, entryId)
    const locale = getReadinessLocale(readiness, 'en')
    expect(preview.status).toBe('no_changes')
    expect(preview.locales[0]).toMatchObject({ locale: 'en', status: 'no_changes' })
    expect(locale).toMatchObject({ state: 'live', canPublish: false })
  })

  it('rejects an invalid entry before issuing a publish confirmation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.entries.publish.previewPublishEntryOperation, {
        entryId: 'not-an-entry-id',
        expectedVersion: 1,
        locales: ['en'],
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ status: 'stale', code: 'ENTRY_NOT_FOUND' })],
      confirmation: null,
    })
  })

  it('rejects publish execution without a confirmation token', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'post',
      localized: { title: 'Post' },
    })

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        entryId,
        locales: ['en'],
        expectedVersion: await currentDraftVersion(owner, entryId),
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      code: 'CONFIRMATION_REQUIRED',
    })
  })
})

describe('entry readiness detail', () => {
  it('[LOC-01] returns every configured locale from canonical readiness with a non-English primary and explicit missing states', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx, {
      locales: ['de', 'en', 'fr'],
      defaultLocale: 'de',
    })
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'pages',
      locale: 'de',
      slug: 'willkommen',
      localized: { title: 'Willkommen' },
    })

    const detail = await readEntryReadinessDetail(owner, entryId)
    const de = getReadinessLocale(detail, 'de')
    const en = getReadinessLocale(detail, 'en')
    const fr = getReadinessLocale(detail, 'fr')
    expect(detail).toMatchObject({ entryId, collection: 'pages', primaryLocale: 'de' })
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
    expect(en).toMatchObject({ state: 'missing', draftExists: false, canPublish: false })
    expect(fr).toMatchObject({ state: 'missing', draftExists: false, canPublish: false })
  })

  it('derives draft, in-review, live, and live-with-changes from canonical rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const draftEntryId = await owner.createEntry({
      collection: 'notes',
      slug: 'empty-note',
      localized: {},
    })
    const reviewEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'review-me',
      localized: { title: 'Review me' },
    })
    const liveEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'live-post',
      localized: { title: 'Live post' },
    })
    await publishEntry(owner, liveEntryId)
    const changedEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'changed-post',
      localized: { title: 'Published title' },
    })
    await publishEntry(owner, changedEntryId)
    await owner.saveEntryDraft({
      entryId: changedEntryId,
      expectedDraftVersion: await currentDraftVersion(owner, changedEntryId),
      patch: { locales: { en: { values: { title: 'Updated draft title' } } } },
    })
    // A review preview is deliberately fenced by the collection/locale route
    // generation. Create it after the unrelated publication fixtures so this
    // assertion exercises an active review rather than a correctly stale one.
    const reviewRequestId = await seedPendingPublishReview(ctx, {
      entryId: reviewEntryId,
      locales: ['en'],
    })

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
      canPreview: true,
      canPublish: false,
      publicUrl: null,
    })
    expect(inReview).toMatchObject({
      state: 'in_review',
      reviewRequestId,
      canRequestReview: false,
    })
    expect(live).toMatchObject({
      state: 'live',
      published: true,
      hasUnpublishedChanges: false,
      publicUrl: '/posts/live-post',
      canPublish: false,
    })
    expect(liveWithChanges).toMatchObject({
      state: 'live_with_changes',
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

  it('marks a pinned review stale after its parent route generation changes', async () => {
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
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: await currentDraftVersion(owner, rootAId),
      patch: { locales: { en: { slug: 'root-renamed', values: { title: 'Root A' } } } },
    })
    await publishEntry(owner, rootAId)

    const en = getReadinessLocale(await readEntryReadinessDetail(owner, childId), 'en')
    expect(reviewRequestId).toBeTruthy()
    expect(en).toMatchObject({
      state: 'ready',
      reviewRequestId: null,
      canPublish: true,
      nextAction: expect.objectContaining({ kind: 'publish_locale', locale: 'en' }),
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
    await installDiagnosticsContract(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    const now = Date.now()
    const assetId = (await ctx.seed('assets', {
      storageId,
      filename: 'hero.png',
      mimeType: 'image/png',
      size: 4,
      sha256: '0'.repeat(64),
      width: 800,
      height: 600,
      frames: 1,
      alt: { en: 'Original asset alt' },
      caption: { en: 'Original asset caption' },
      scope: 'collection',
      entryId: null,
      collection: 'gallery',
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })) as string
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

  it('allows incomplete saves but blocks localized and shared required fields', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'strictPosts',
      slug: 'missing-required',
      localized: { title: 'Partial draft' },
      shared: {},
    })
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: await currentDraftVersion(owner, entryId),
        patch: { locales: { en: { values: { title: 'Still partial' } } } },
      }),
    ).resolves.toMatchObject({ draftVersion: 2 })

    const en = getReadinessLocale(await readEntryReadinessDetail(owner, entryId), 'en')
    expect(en).toMatchObject({ state: 'needs_work', canPreview: true, canPublish: false })
    expect(en.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required_localized_field_missing',
          locale: 'en',
          fieldPath: 'summary',
        }),
        expect.objectContaining({
          code: 'required_shared_field_missing',
          locale: null,
          fieldPath: 'featuredLabel',
        }),
      ]),
    )
  })

  it('blocks data-only publish readiness when required fields are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installDiagnosticsContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'empty-author',
      localized: {},
    })

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
          locale: 'en',
          fieldPath: 'name',
        }),
      ]),
    )
  })
})
