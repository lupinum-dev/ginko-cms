import { v } from 'convex/values'

import type { Id } from './_generated/dataModel.js'
import { internalAction, internalMutation, internalQuery } from './_generated/server.js'
import { assetDiscoveryFields } from './assets/scope.js'
import type { MutationCtx } from './lib/types.js'
import { boundedPage } from './liveFixtures/bounds.js'
import {
  entryByIndex,
  entrySlug,
  FIXTURE_COLLECTION,
  FIXTURE_LOCALES,
  fixtureTitle,
  setupEntriesPageHandler,
} from './liveFixtures/entries.js'

export {
  FIXTURE_COLLECTION,
  FIXTURE_LOCALES,
  setupEntriesPageHandler,
} from './liveFixtures/entries.js'
export { boundedPage } from './liveFixtures/bounds.js'
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
  const reviewTitle = `${args.prefix} publish all review`
  const priorPendingReviews = await ctx.db
    .query('reviewRequests')
    .withIndex('by_entry', (query) => query.eq('entryId', String(reviewEntry._id)))
    .filter((query) =>
      query.and(
        query.eq(query.field('status'), 'pending'),
        query.eq(query.field('title'), reviewTitle),
      ),
    )
    .take(10)
  for (const review of priorPendingReviews) await ctx.db.delete(review._id)
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
  const reviewLocales = ['en', 'de'] as const
  const reviewDrafts = await Promise.all(
    reviewLocales.map(async (locale) => {
      const draft = await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', reviewEntry._id).eq('locale', locale))
        .unique()
      if (!draft) throw new Error(`Live review fixture has no ${locale} draft.`)
      return { draft, locale }
    }),
  )
  const publishedVersions = new Map(
    reviewEntry.activePublications.map((publication) => [
      publication.locale,
      publication.localeVersion,
    ]),
  )
  const needsFreshDraft = reviewDrafts.every(
    ({ draft, locale }) => draft.version <= (publishedVersions.get(locale) ?? 0),
  )
  let reviewVersion = reviewEntry.draftVersion
  if (needsFreshDraft) {
    reviewVersion =
      Math.max(
        reviewEntry.draftVersion,
        ...reviewDrafts.map(({ draft }) => draft.version),
        ...reviewDrafts.map(({ locale }) => publishedVersions.get(locale) ?? 0),
      ) + 1
    for (const { draft, locale } of reviewDrafts) {
      const title = `${args.prefix} review ${locale}`
      await ctx.db.patch(draft._id, {
        values: { ...draft.values, title },
        bodyMdc: `# ${title}\n`,
        version: reviewVersion,
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
          sourceDraftVersion: reviewVersion,
          sourceLocaleVersion: reviewVersion,
          hasUnpublishedChanges: true,
        })
      }
    }
    await ctx.db.patch(reviewEntry._id, {
      draftVersion: reviewVersion,
      updatedBy: args.prefix,
      updatedAt: Date.now(),
    })
  }
  return {
    redirectSourcePath: `/docs/${args.prefix}-old`,
    redirectTargetPath: `/docs/${roleEntry.slug}`,
    reviewEntryId: String(reviewEntry._id),
    reviewVersion,
    reviewTitle,
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
      roleEntryStableId: roleEntry.stableId,
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
