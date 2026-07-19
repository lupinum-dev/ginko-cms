import { v } from 'convex/values'

import type { Id } from './_generated/dataModel.js'
import { internalAction, internalMutation, internalQuery } from './_generated/server.js'
import { assetDiscoveryFields } from './assets/scope.js'
import {
  buildPublicProjectionPayload,
  buildPublicSearchProjectionPayload,
} from './entries/workflow/projection.js'
import type { MutationCtx, QueryCtx } from './lib/types.js'

export const FIXTURE_COLLECTION = 'docs'
export const FIXTURE_LOCALES = ['en', 'de', 'fr'] as const
const LIVE_MDC_BYTES = 65_408
const MAX_PAGE_SIZE = 100
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const FIXTURE_PNG_BYTES = 68
const FIXTURE_PNG_SHA256 = '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460'
type FixtureRole = 'owner' | 'publisher' | 'editor' | 'viewer'

export function assertFixturePrefix(prefix: string) {
  if (!/^refactor-[a-z0-9][a-z0-9-]{5,}$/i.test(prefix)) {
    throw new Error('Live fixture prefix is invalid.')
  }
}

export function boundedPage(start: number, count: number, maximum: number) {
  if (!Number.isSafeInteger(start) || start < 0 || start > maximum) {
    throw new Error('Live fixture page start is invalid.')
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PAGE_SIZE) {
    throw new Error(`Live fixture page count must be from 1 through ${MAX_PAGE_SIZE}.`)
  }
  return { start, end: Math.min(maximum, start + count) }
}

function entryStableId(prefix: string, index: number) {
  return `${prefix}-docs-${String(index).padStart(4, '0')}`
}

function entrySlug(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, '0')}`
}

function fixtureTitle(prefix: string, index: number, locale: string) {
  if (index < 1_205) return `${prefix} page ${String(index).padStart(4, '0')} ${locale}`
  if (index === 1_499) return `${prefix} review terminal ${locale}`
  return `${prefix} other ${String(index).padStart(4, '0')} ${locale}`
}

function exactLongMdc(prefix: string) {
  const heading = `# ${prefix} long document\n\n`
  const headingBytes = new TextEncoder().encode(heading).byteLength
  return `${heading}${'x'.repeat(LIVE_MDC_BYTES - headingBytes)}`
}

async function installedContentHash(ctx: QueryCtx | MutationCtx) {
  const contract = await ctx.db
    .query('cmsContract')
    .withIndex('by_key', (q) => q.eq('key', 'active'))
    .unique()
  if (!contract || contract.transitionState !== 'ready') {
    throw new Error('Live fixtures require a ready installed contract.')
  }
  const collection = (contract.content as { collections?: Record<string, unknown> }).collections?.[
    FIXTURE_COLLECTION
  ]
  if (!collection) throw new Error(`Installed contract has no ${FIXTURE_COLLECTION} collection.`)
  return contract.contentHash
}

async function entryByIndex(ctx: QueryCtx | MutationCtx, prefix: string, index: number) {
  return await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collection', FIXTURE_COLLECTION).eq('stableId', entryStableId(prefix, index)),
    )
    .unique()
}

export async function setupEntriesPageHandler(
  ctx: MutationCtx,
  args: { prefix: string; start: number; count: number },
) {
  const page = boundedPage(args.start, args.count, 1_500)
  const contentHash = await installedContentHash(ctx)
  let inserted = 0
  for (let index = page.start; index < page.end; index += 1) {
    if (await entryByIndex(ctx, args.prefix, index)) continue
    const parent = index > 0 && index < 5 ? await entryByIndex(ctx, args.prefix, index - 1) : null
    if (index > 0 && index < 5 && !parent) {
      throw new Error('Live fixture depth chain must be created in order.')
    }
    const stableId = entryStableId(args.prefix, index)
    const slug = entrySlug(args.prefix, index)
    const createdAt = 1_780_000_000_000 + index
    const entryId = await ctx.db.insert('entries', {
      collection: FIXTURE_COLLECTION,
      stableId,
      lifecycle: 'active',
      slug,
      parentEntryId: parent?._id ?? null,
      orderRank: String(index).padStart(8, '0'),
      nodeKind: 'page',
      shared: {},
      draftVersion: 1,
      sharedVersion: 1,
      activePublications: [],
      latestEditorialRevisionId: null,
      createdBy: args.prefix,
      updatedBy: args.prefix,
      createdAt,
      updatedAt: createdAt,
    })
    const snapshots: Record<
      string,
      {
        shared: Record<string, never>
        values: { title: string; description: string }
        bodyMdc: string
        slug: string
        parentEntryId: Id<'entries'> | null
        orderRank: string
        sharedVersion: number
        localeVersion: number
      }
    > = {}
    for (const locale of FIXTURE_LOCALES) {
      const title = fixtureTitle(args.prefix, index, locale)
      const bodyMdc = index === 0 ? exactLongMdc(args.prefix) : `# ${title}\n`
      const values = { title, description: `${args.prefix} fixture ${index}` }
      await ctx.db.insert('entryLocaleDrafts', {
        entryId,
        locale,
        slug: null,
        values,
        bodyMdc,
        version: 1,
        updatedBy: args.prefix,
        updatedAt: createdAt,
      })
      snapshots[locale] = {
        shared: {},
        values,
        bodyMdc,
        slug,
        parentEntryId: parent?._id ?? null,
        orderRank: String(index).padStart(8, '0'),
        sharedVersion: 1,
        localeVersion: 1,
      }
    }
    const revisionId = await ctx.db.insert('entryRevisions', {
      entryId,
      collection: FIXTURE_COLLECTION,
      revisionNumber: 1,
      operationId: `${args.prefix}-publish-${index}`,
      parentRevisionId: null,
      kind: 'publish',
      snapshots,
      affectedLocales: [...FIXTURE_LOCALES],
      contentHash,
      message: null,
      createdBy: args.prefix,
      createdAt,
    })
    await ctx.db.patch(entryId, {
      activePublications: FIXTURE_LOCALES.map((locale) => ({
        locale,
        revisionId,
        sharedVersion: 1,
        localeVersion: 1,
        firstPublishedAt: createdAt,
        activatedAt: createdAt,
        activatedBy: args.prefix,
      })),
      latestEditorialRevisionId: revisionId,
    })
    for (const locale of FIXTURE_LOCALES) {
      const snapshot = snapshots[locale]!
      const title = snapshot.values.title
      const projection = {
        entryId,
        collection: FIXTURE_COLLECTION,
        locale,
        revisionId,
        stableId,
        parentEntryId: parent?._id ?? null,
        orderKey: String(index).padStart(8, '0'),
        slug,
        title,
        description: snapshots[locale]!.values.description,
        data: snapshots[locale]!.values,
        searchText: `${title} ${slug}`,
        cacheTags: [],
        assetFacts: [],
        navIncluded: true,
        sitemapIncluded: true,
        searchIncluded: true,
        entryCreatedAt: createdAt,
        firstPublishedAt: createdAt,
        lastPublishedAt: createdAt,
      }
      await ctx.db.insert('publicEntries', buildPublicProjectionPayload(projection))
      await ctx.db.insert('publicSearchEntries', buildPublicSearchProjectionPayload(projection))
      await ctx.db.insert('draftSearchEntries', {
        entryId,
        collection: FIXTURE_COLLECTION,
        locale,
        slug,
        title,
        searchText: `${title} ${slug} ${stableId} ${title} ${snapshot.values.description} ${snapshot.bodyMdc}`,
        lifecycle: 'active',
        status: 'published',
        updatedAt: createdAt,
        sourceDraftVersion: 1,
        sourceSharedVersion: 1,
        sourceLocaleVersion: 1,
        sourcePublicationHash: `${contentHash}:${String(revisionId)}:${locale}`,
        hasUnpublishedChanges: false,
        hasMissingTranslations: false,
      })
    }
    inserted += 1
  }
  return { start: page.start, end: page.end, inserted, complete: page.end === 1_500 }
}

export const setupEntriesPage = internalMutation({
  args: { prefix: v.string(), start: v.number(), count: v.number() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await setupEntriesPageHandler(ctx, args)
  },
})

export const createStoragePage = internalAction({
  args: { prefix: v.string(), start: v.number(), count: v.number() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const page = boundedPage(args.start, args.count, 500)
    const bytes = Uint8Array.from(atob(FIXTURE_PNG_BASE64), (character) => character.charCodeAt(0))
    const storageIds = []
    for (let index = page.start; index < page.end; index += 1) {
      storageIds.push(await ctx.storage.store(new Blob([bytes], { type: 'image/png' })))
    }
    return storageIds
  },
})

export async function setupAssetsPageHandler(
  ctx: MutationCtx,
  args: { prefix: string; start: number; count: number; storageIds: Id<'_storage'>[] },
) {
  const page = boundedPage(args.start, args.count, 500)
  if (args.storageIds.length !== page.end - page.start) {
    throw new Error('Live fixture asset storage page does not match the requested page.')
  }
  let inserted = 0
  for (let index = page.start; index < page.end; index += 1) {
    const filename = `${args.prefix}-asset-${String(index).padStart(3, '0')}.png`
    const filenameSort = filename.toLowerCase()
    const existing = await ctx.db
      .query('assets')
      .withIndex('by_filename', (q) => q.eq('filenameSort', filenameSort))
      .first()
    if (existing) continue
    const createdAt = 1_780_000_100_000 + index
    await ctx.db.insert('assets', {
      storageId: args.storageIds[index - page.start]!,
      filename,
      mimeType: 'image/png',
      size: FIXTURE_PNG_BYTES,
      sha256: FIXTURE_PNG_SHA256,
      width: 1,
      height: 1,
      frames: 1,
      alt: null,
      caption: null,
      scope: 'global',
      entryId: null,
      collection: null,
      tags: [args.prefix],
      createdBy: args.prefix,
      updatedBy: null,
      createdAt,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      ...assetDiscoveryFields({
        filename,
        mimeType: 'image/png',
        tags: [args.prefix],
        createdAt,
        updatedAt: null,
        deletedAt: null,
      }),
    })
    inserted += 1
  }
  return { start: page.start, end: page.end, inserted, complete: page.end === 500 }
}

export const setupAssetsPage = internalMutation({
  args: {
    prefix: v.string(),
    start: v.number(),
    count: v.number(),
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await setupAssetsPageHandler(ctx, args)
  },
})

export async function setupMembersHandler(
  ctx: MutationCtx,
  args: {
    prefix: string
    members: Array<{ userId: string; email: string; role: FixtureRole }>
  },
) {
  if (args.members.length !== 4 || new Set(args.members.map(({ role }) => role)).size !== 4) {
    throw new Error('Live fixtures require exactly one member for every CMS role.')
  }
  for (const member of args.members) {
    if (!member.email.toLowerCase().includes(args.prefix.toLowerCase())) {
      throw new Error('Disposable member email must contain the fixture prefix.')
    }
    const existing = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', member.userId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: member.email.toLowerCase(),
        role: member.role,
        updatedAt: Date.now(),
        updatedBy: args.prefix,
      })
    } else {
      await ctx.db.insert('members', {
        userId: member.userId,
        email: member.email.toLowerCase(),
        displayName: `${args.prefix} ${member.role}`,
        role: member.role,
        createdAt: Date.now(),
        updatedAt: null,
        updatedBy: args.prefix,
      })
    }
  }
  return { members: args.members.length }
}

export const setupMembers = internalMutation({
  args: {
    prefix: v.string(),
    members: v.array(
      v.object({
        userId: v.string(),
        email: v.string(),
        role: v.union(
          v.literal('owner'),
          v.literal('publisher'),
          v.literal('editor'),
          v.literal('viewer'),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await setupMembersHandler(ctx, args)
  },
})

export async function setupProbesHandler(ctx: MutationCtx, args: { prefix: string }) {
  const [roleEntry, reviewEntry] = await Promise.all([
    entryByIndex(ctx, args.prefix, 0),
    entryByIndex(ctx, args.prefix, 1_498),
  ])
  if (!roleEntry || !reviewEntry) throw new Error('Live fixture probe entries are incomplete.')
  const redirectId = `${args.prefix}-structural-redirect`
  const existingRedirect = await ctx.db
    .query('redirects')
    .withIndex('by_redirect_id', (q) => q.eq('redirectId', redirectId))
    .unique()
  if (!existingRedirect) {
    await ctx.db.insert('redirects', {
      redirectId,
      collection: FIXTURE_COLLECTION,
      locale: 'en',
      kind: 'prefix',
      fromPath: `/docs/${args.prefix}-old`,
      targetEntryId: roleEntry._id,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: `${args.prefix}-redirect`,
      createdBy: args.prefix,
      createdAt: Date.now(),
      retiredBy: null,
      retiredAt: null,
      updatedAt: Date.now(),
    })
  }
  if (reviewEntry.draftVersion === 1) {
    for (const locale of ['en', 'de'] as const) {
      const draft = await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', reviewEntry._id).eq('locale', locale))
        .unique()
      if (!draft) throw new Error(`Live review fixture has no ${locale} draft.`)
      const title = `${args.prefix} review ${locale}`
      await ctx.db.patch(draft._id, {
        values: { ...draft.values, title },
        bodyMdc: `# ${title}\n`,
        version: 2,
        updatedBy: args.prefix,
        updatedAt: Date.now(),
      })
      const search = await ctx.db
        .query('draftSearchEntries')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', reviewEntry._id).eq('locale', locale))
        .unique()
      if (search) {
        await ctx.db.patch(search._id, {
          title,
          searchText: `${title} ${reviewEntry.slug}`,
          updatedAt: Date.now(),
          sourceDraftVersion: 2,
          sourceLocaleVersion: 2,
          hasUnpublishedChanges: true,
        })
      }
    }
    await ctx.db.patch(reviewEntry._id, {
      draftVersion: 2,
      updatedBy: args.prefix,
      updatedAt: Date.now(),
    })
  }
  return {
    redirectSourcePath: `/docs/${args.prefix}-old`,
    redirectTargetPath: `/docs/${roleEntry.slug}`,
    reviewEntryId: String(reviewEntry._id),
    reviewVersion: 2,
    reviewTitle: `${args.prefix} publish all review`,
    reviewPublicPath: `/docs/${reviewEntry.slug}`,
  }
}

export const setupProbes = internalMutation({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await setupProbesHandler(ctx, args)
  },
})

export const inspect = internalQuery({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const [roleEntry, reviewEntry, mcpEntry] = await Promise.all([
      entryByIndex(ctx, args.prefix, 0),
      entryByIndex(ctx, args.prefix, 1_498),
      entryByIndex(ctx, args.prefix, 1_497),
    ])
    if (!roleEntry || !reviewEntry || !mcpEntry) {
      throw new Error('Live fixture entries are incomplete.')
    }
    return {
      collection: FIXTURE_COLLECTION,
      roleEntryId: String(roleEntry._id),
      reviewEntryId: String(reviewEntry._id),
      reviewDraftVersion: reviewEntry.draftVersion,
      mcpEntryId: String(mcpEntry._id),
      mcpDraftVersion: mcpEntry.draftVersion,
      terminalPaginationTitle: fixtureTitle(args.prefix, 1_204, 'en'),
      deepSearchTitle: fixtureTitle(args.prefix, 1_499, 'en'),
      deepestSlugPath: [0, 1, 2, 3, 4].map((index) => entrySlug(args.prefix, index)),
      assetTerminalFilename: `${args.prefix}-asset-499.png`,
    }
  },
})

export const findAssetStorageId = internalQuery({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const asset = await ctx.db
      .query('assets')
      .withIndex('by_filename', (q) =>
        q.gte('filenameSort', args.prefix).lt('filenameSort', `${args.prefix}\uFFFF`),
      )
      .first()
    return asset?.storageId ?? null
  },
})
export const countPublicLocale = internalQuery({
  args: { prefix: v.string(), locale: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    if (!FIXTURE_LOCALES.includes(args.locale as (typeof FIXTURE_LOCALES)[number])) {
      throw new Error('Live fixture locale is invalid.')
    }
    const rows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_orderKey', (q) =>
        q.eq('collection', FIXTURE_COLLECTION).eq('locale', args.locale),
      )
      .collect()
    return rows.filter((row) => row.stableId.startsWith(args.prefix)).length
  },
})
