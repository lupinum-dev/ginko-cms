import type { Id } from '../_generated/dataModel.js'
import { draftSearchPublicationHash } from '../entries/workflow/draftSearch.js'
import {
  buildPublicProjectionPayload,
  buildPublicSearchProjectionPayload,
} from '../entries/workflow/projection.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import { boundedPage } from './bounds.js'

export const FIXTURE_COLLECTION = 'docs'
export const FIXTURE_LOCALES = ['en', 'de', 'fr'] as const

const LIVE_MDC_BYTES = 65_408

export function entryStableId(prefix: string, index: number) {
  return `${prefix}-docs-${String(index).padStart(4, '0')}`
}

export function entrySlug(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, '0')}`
}

export function fixtureTitle(prefix: string, index: number, locale: string) {
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

export async function entryByIndex(ctx: QueryCtx | MutationCtx, prefix: string, index: number) {
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
    const draftVersion = index < 1_205 ? 2 : 1
    const entryId = await ctx.db.insert('entries', {
      collection: FIXTURE_COLLECTION,
      stableId,
      lifecycle: 'active',
      slug,
      parentEntryId: parent?._id ?? null,
      orderRank: String(index).padStart(8, '0'),
      nodeKind: 'page',
      shared: {},
      draftVersion,
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
        version: draftVersion,
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
    const publishedEntry = await ctx.db.get(entryId)
    if (!publishedEntry) throw new Error('Live fixture publication was not persisted.')
    const sourcePublicationHash = draftSearchPublicationHash(publishedEntry)
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
        description: snapshot.values.description,
        data: snapshot.values,
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
        sourceDraftVersion: draftVersion,
        sourceSharedVersion: 1,
        sourceLocaleVersion: draftVersion,
        sourcePublicationHash,
        hasUnpublishedChanges: draftVersion === 2,
        hasMissingTranslations: false,
      })
    }
    inserted += 1
  }
  return { start: page.start, end: page.end, inserted, complete: page.end === 1_500 }
}
