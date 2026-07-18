import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import {
  getCollection,
  getCollectionDefaultLocale,
  needsStableId,
  type getCollectionOrThrow,
} from '../lib/collections.js'
import { getRoutingLocales } from '../lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import {
  deleteAssetRefsForSource,
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  extractPublicBodyAssetRefs,
  extractPublicFieldAssetRefs,
  replaceAssetRefs,
  type ReplaceAssetRefsInput,
  uniqueAssetRefs,
} from './workflow/assetRefs.js'
import {
  draftSearchEntryMatches,
  refreshDraftSearchEntriesForEntry,
  upsertDraftSearchEntry,
} from './workflow/draftSearch.js'
import { stableHash } from './workflow/hashing.js'
import {
  buildPublicProjectionPayload,
  buildPublicSearchProjectionPayload,
  deletePublicProjection,
  upsertPublicProjection,
} from './workflow/projection.js'
import {
  buildPublicProjectionFromRevisionSnapshot,
  readPublicBodyFromRevision,
  type PublicProjectionBuildResult,
} from './workflow/projectionBuild.js'
import {
  MAX_PUBLIC_TREE_DEPTH,
  publicPathForEntry,
  publicPathFromTreeSegments,
  resolvePublicRoute,
  validatePublicPath,
} from './workflow/publicTree.js'

type CollectionDoc = Awaited<ReturnType<typeof getCollectionOrThrow>>
type PublicEntryDoc = Doc<'publicEntries'>

export async function mapActivePublicEntryRow(
  ctx: QueryOrMutationCtx,
  row: PublicEntryDoc,
  collection: CollectionDoc,
) {
  const body = await readPublicBodyFromRevision(ctx, row, collection)
  const path = await publicPathForEntry(ctx, row, {
    pathPrefix: pathPrefixForLocale(collection, row.locale),
    rootSlug: rootSlugForLocale(collection, row.locale),
  })
  if (!path) throw new Error(`Published entry ${row.entryId} is unreachable from its public tree`)
  const routingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )
  return {
    _id: String(row.entryId),
    collection: row.collection,
    slug: row.slug,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
    locale: row.locale,
    resolvedLocale: row.locale,
    title: row.title,
    data: {
      ...(row.data as JsonMap),
      ...(typeof row.description === 'string' ? { description: row.description } : {}),
    },
    bodyAst: body.bodyAst,
    toc: body.toc,
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId,
    assetFacts: row.assetFacts,
  }
}

export type ProjectionRepairIssue = {
  code: string
  message: string
  entryId?: string
  locale?: string
}

export type ProjectionRecordResult = {
  repairedPublicRows: number
  repairedDraftSearchRows: number
  repairedAssetRefSources: number
  deletedOrphans: number
  issues: ProjectionRepairIssue[]
}

type AssetRefSource = ReplaceAssetRefsInput

function emptyProjectionResult(): ProjectionRecordResult {
  return {
    repairedPublicRows: 0,
    repairedDraftSearchRows: 0,
    repairedAssetRefSources: 0,
    deletedOrphans: 0,
    issues: [],
  }
}

function draftSharedAssetRefSource(entry: EntryDoc): AssetRefSource {
  return {
    sourceKind: 'draft',
    sourceId: `${String(entry._id)}:shared`,
    sourceFence: { kind: 'draftVersion', version: entry.sharedVersion },
    entryId: entry._id,
    collection: entry.collection,
    refs: extractAssetRefsFromValues(entry.shared, { locale: null }),
  }
}

function draftLocaleAssetRefSource(row: Doc<'entryLocaleDrafts'>): AssetRefSource {
  return {
    sourceKind: 'draft',
    sourceId: `${String(row.entryId)}:${row.locale}`,
    sourceFence: { kind: 'draftVersion', version: row.version },
    entryId: row.entryId,
    collection: '',
    refs: uniqueAssetRefs([
      ...extractAssetRefsFromValues(row.values, { locale: row.locale }),
      ...extractAssetRefsFromText(row.bodyMdc, { fieldPath: 'bodyMdc', locale: row.locale }),
    ]),
  }
}

function revisionAssetRefSource(
  revision: Doc<'entryRevisions'>,
  locale: string,
): AssetRefSource | null {
  const snapshot = revision.snapshots[locale]
  if (!snapshot) return null
  return {
    sourceKind: 'revision',
    sourceId: `${String(revision._id)}:${locale}`,
    sourceFence: {
      kind: 'revision',
      revisionId: revision._id,
      contentHash: revision.contentHash,
    },
    entryId: revision.entryId,
    collection: revision.collection,
    refs: uniqueAssetRefs([
      ...extractAssetRefsFromValues(snapshot.shared, { locale: null }),
      ...extractAssetRefsFromValues(snapshot.values, { locale }),
      ...extractAssetRefsFromText(snapshot.bodyMdc, { fieldPath: 'bodyMdc', locale }),
    ]),
  }
}

async function publicAssetRefSource(
  ctx: QueryOrMutationCtx,
  row: Doc<'publicEntries'>,
  collection: CollectionDoc,
): Promise<AssetRefSource> {
  const body = await readPublicBodyFromRevision(ctx, row, collection)
  return {
    sourceKind: 'public',
    sourceId: `${String(row.entryId)}:${row.locale}`,
    sourceFence: { kind: 'publicRevision', revisionId: row.revisionId },
    entryId: row.entryId,
    collection: row.collection,
    refs: uniqueAssetRefs([
      ...extractPublicFieldAssetRefs(row.data, collection.fields, {
        fieldPathPrefix: 'data',
        locale: row.locale,
      }),
      ...extractPublicBodyAssetRefs(body.bodyAst, { locale: row.locale }),
    ]),
  }
}

function assetIdsFromSource(source: AssetRefSource | null): string[] {
  if (!source) return []
  return [...new Set(source.refs.map((ref) => ref.assetId))]
}

export function canonicalSharedDraftAssetIds(entry: EntryDoc): string[] {
  return assetIdsFromSource(draftSharedAssetRefSource(entry))
}

export function canonicalLocaleDraftAssetIds(row: Doc<'entryLocaleDrafts'>): string[] {
  return assetIdsFromSource(draftLocaleAssetRefSource(row))
}

export function canonicalRevisionAssetIds(revision: Doc<'entryRevisions'>): string[] {
  return [
    ...new Set(
      Object.keys(revision.snapshots).flatMap((locale) =>
        assetIdsFromSource(revisionAssetRefSource(revision, locale)),
      ),
    ),
  ]
}

async function replaceCanonicalAssetRefSource(ctx: MutationCtx, source: AssetRefSource) {
  await replaceAssetRefs(ctx, source, 'repair')
}

function comparableAssetRefs(rows: Array<Omit<Doc<'contentAssetRefs'>, '_id' | '_creationTime'>>) {
  return [...rows].sort((left, right) =>
    [left.sourceKind, left.sourceId, left.assetId, left.fieldPath, left.locale ?? '']
      .join('\u0000')
      .localeCompare(
        [right.sourceKind, right.sourceId, right.assetId, right.fieldPath, right.locale ?? ''].join(
          '\u0000',
        ),
      ),
  )
}

function expectedAssetRefRows(source: AssetRefSource) {
  return comparableAssetRefs(
    uniqueAssetRefs(source.refs).map((ref) => ({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceFence: source.sourceFence,
      assetId: ref.assetId,
      fieldPath: ref.fieldPath,
      locale: ref.locale,
      entryId: source.entryId,
      collection: source.collection,
    })),
  )
}

async function assetRefSourceMatches(ctx: QueryOrMutationCtx, source: AssetRefSource) {
  const rows = await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_source', (query) =>
      query.eq('sourceKind', source.sourceKind).eq('sourceId', source.sourceId),
    )
    .collect()
  const actual = comparableAssetRefs(
    rows.map(({ _id: _rowId, _creationTime: _creationTime, ...row }) => row),
  )
  return stableHash(actual) === stableHash(expectedAssetRefRows(source))
}

async function expectedPublicProjection(
  ctx: QueryOrMutationCtx,
  entry: EntryDoc,
  collection: CollectionDoc,
  publication: EntryDoc['activePublications'][number],
): Promise<
  { ok: true; built: PublicProjectionBuildResult } | { ok: false; issue: ProjectionRepairIssue }
> {
  const revision = await ctx.db.get(publication.revisionId)
  const snapshot = revision?.snapshots[publication.locale]
  if (!revision || !snapshot) {
    return {
      ok: false,
      issue: {
        code: 'active-revision-missing',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Active publication points at a missing complete snapshot.',
      } satisfies ProjectionRepairIssue,
    }
  }
  const slug = needsStableId(collection) ? `${snapshot.slug}-${entry.stableId}` : snapshot.slug
  const path = await publicPathForEntrySnapshot(ctx, {
    collection,
    locale: publication.locale,
    parentEntryId: snapshot.parentEntryId,
    slug,
  })
  if (!path) {
    return {
      ok: false,
      issue: {
        code: 'public-parent-unreachable',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Active publication has an unreachable public parent.',
      } satisfies ProjectionRepairIssue,
    }
  }
  const built = await buildPublicProjectionFromRevisionSnapshot(ctx, {
    entry,
    collection,
    revisionId: revision._id,
    locale: publication.locale,
    localeSnapshot: snapshot,
    publicPath: path,
    firstPublishedAt: publication.firstPublishedAt,
    now: publication.activatedAt,
  })
  built.input.slug = slug
  return { ok: true, built }
}

async function publicPathForEntrySnapshot(
  ctx: QueryOrMutationCtx,
  args: {
    collection: CollectionDoc
    locale: string
    parentEntryId: Id<'entries'> | null
    slug: string
  },
) {
  const segments = [args.slug]
  const seen = new Set<string>()
  let parentEntryId = args.parentEntryId
  while (parentEntryId !== null) {
    const parentKey = String(parentEntryId)
    if (seen.has(parentKey) || segments.length >= MAX_PUBLIC_TREE_DEPTH) return null
    seen.add(parentKey)
    const parent = await ctx.db.get(parentEntryId)
    if (!parent || parent.collection !== args.collection.slug) return null
    const publication = parent.activePublications.find((item) => item.locale === args.locale)
    if (!publication) return null
    const revision = await ctx.db.get(publication.revisionId)
    const snapshot = revision?.snapshots[args.locale]
    if (!snapshot) return null
    const segment = needsStableId(args.collection)
      ? `${snapshot.slug}-${parent.stableId}`
      : snapshot.slug
    const validated = validatePublicPath(`/${segment}`)
    if (!validated.ok || validated.segments.length !== 1) return null
    segments.unshift(segment)
    parentEntryId = snapshot.parentEntryId
  }
  return publicPathFromTreeSegments(segments, {
    pathPrefix: pathPrefixForLocale(args.collection, args.locale),
    rootSlug: rootSlugForLocale(args.collection, args.locale),
  })
}

function projectionPayloadMatches(
  row: Doc<'publicEntries'> | Doc<'publicSearchEntries'>,
  expected: Record<string, unknown>,
) {
  const { _id: _rowId, _creationTime: _creationTime, ...actual } = row
  return stableHash(actual) === stableHash(expected)
}

async function publicDerivedRowsMatch(
  ctx: QueryOrMutationCtx,
  input: PublicProjectionBuildResult['input'],
) {
  const [publicEntry, search] = await Promise.all([
    ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', input.entryId).eq('locale', input.locale),
      )
      .unique(),
    ctx.db
      .query('publicSearchEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', input.entryId).eq('locale', input.locale),
      )
      .unique(),
  ])
  const expectedSearch =
    input.searchIncluded === false ? null : buildPublicSearchProjectionPayload(input)
  return (
    !!publicEntry &&
    projectionPayloadMatches(publicEntry, buildPublicProjectionPayload(input)) &&
    (expectedSearch
      ? !!search && projectionPayloadMatches(search, expectedSearch)
      : search === null)
  )
}

export async function repairDerivedRowsForEntry(
  ctx: MutationCtx,
  entry: EntryDoc,
  collection: CollectionDoc | null,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  await replaceCanonicalAssetRefSource(ctx, draftSharedAssetRefSource(entry))
  result.repairedAssetRefSources += 1
  if (!collection) {
    result.issues.push({
      code: 'collection-not-found',
      entryId: String(entry._id),
      message: 'Collection not found.',
    })
    return result
  }
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  result.repairedDraftSearchRows += collection.locales.length

  const seenLocales = new Set<string>()
  for (const publication of entry.activePublications) {
    if (seenLocales.has(publication.locale) || !collection.locales.includes(publication.locale)) {
      result.issues.push({
        code: 'invalid-active-publication-locale',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Active publication locale is duplicated or unsupported by the contract.',
      })
      continue
    }
    seenLocales.add(publication.locale)
    const expected = await expectedPublicProjection(ctx, entry, collection, publication)
    if (!expected.ok) {
      result.issues.push(expected.issue)
      await deletePublicProjection(ctx, { entryId: entry._id, locale: publication.locale })
      await deleteAssetRefsForSource(
        ctx,
        {
          sourceKind: 'public',
          sourceId: `${String(entry._id)}:${publication.locale}`,
        },
        'repair',
      )
      continue
    }
    if (!(await publicDerivedRowsMatch(ctx, expected.built.input))) {
      await upsertPublicProjection(ctx, expected.built.input)
      result.repairedPublicRows += 1
    }
    const publicRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', entry._id).eq('locale', publication.locale),
      )
      .unique()
    if (!publicRow) throw new Error('Projection repair failed to materialize a public row.')
    await replaceCanonicalAssetRefSource(
      ctx,
      await publicAssetRefSource(ctx, publicRow, collection),
    )
    result.repairedAssetRefSources += 1
  }
  return result
}

export async function repairDraftAssetRefsForRow(
  ctx: MutationCtx,
  row: Doc<'entryLocaleDrafts'>,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  const entry = await ctx.db.get(row.entryId)
  if (!entry) {
    result.issues.push({
      code: 'draft-entry-missing',
      entryId: String(row.entryId),
      locale: row.locale,
      message: 'Localized draft points at a missing entry.',
    })
    return result
  }
  const source = draftLocaleAssetRefSource(row)
  source.collection = entry.collection
  await replaceCanonicalAssetRefSource(ctx, source)
  result.repairedAssetRefSources += 1
  const collection = await getCollectionForRepair(ctx, entry.collection)
  if (collection) {
    await upsertDraftSearchEntry(ctx, entry, row, collection)
    result.repairedDraftSearchRows += 1
  } else {
    result.issues.push({
      code: 'collection-not-found',
      entryId: String(entry._id),
      locale: row.locale,
      message: 'Collection not found.',
    })
  }
  return result
}

export async function repairDraftSearchRow(
  ctx: MutationCtx,
  row: Doc<'draftSearchEntries'>,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  const entry = await ctx.db.get(row.entryId)
  const draft = entry
    ? await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', row.entryId).eq('locale', row.locale),
        )
        .unique()
    : null
  const collection = entry ? await getCollectionForRepair(ctx, entry.collection) : null
  if (!entry || !collection || !collection.locales.includes(row.locale)) {
    await ctx.db.delete(row._id)
    result.deletedOrphans += 1
    return result
  }
  await upsertDraftSearchEntry(ctx, entry, draft, collection, row.locale)
  result.repairedDraftSearchRows += 1
  return result
}

export async function repairRevisionAssetRefsForRow(
  ctx: MutationCtx,
  revision: Doc<'entryRevisions'>,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  for (const locale of Object.keys(revision.snapshots).sort()) {
    const source = revisionAssetRefSource(revision, locale)
    if (!source) continue
    await replaceCanonicalAssetRefSource(ctx, source)
    result.repairedAssetRefSources += 1
  }
  return result
}

type AnyPublicDerivedRow = Doc<'publicEntries'> | Doc<'publicSearchEntries'>

async function repairAnyPublicDerivedRow(
  ctx: MutationCtx,
  row: AnyPublicDerivedRow,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  const entry = await ctx.db.get(row.entryId)
  const collection = entry ? await getCollectionForRepair(ctx, entry.collection) : null
  const publication = entry?.activePublications.find((item) => item.locale === row.locale)
  if (!entry || !collection || !publication) {
    await deletePublicProjection(ctx, { entryId: row.entryId, locale: row.locale })
    await deleteAssetRefsForSource(
      ctx,
      {
        sourceKind: 'public',
        sourceId: `${String(row.entryId)}:${row.locale}`,
      },
      'repair',
    )
    result.deletedOrphans += 1
    return result
  }
  const expected = await expectedPublicProjection(ctx, entry, collection, publication)
  if (!expected.ok) {
    result.issues.push(expected.issue)
    return result
  }
  if (!(await publicDerivedRowsMatch(ctx, expected.built.input))) {
    await upsertPublicProjection(ctx, expected.built.input)
    result.repairedPublicRows += 1
  }
  return result
}

export async function repairPublicProjectionRow(
  ctx: MutationCtx,
  row: Doc<'publicEntries'>,
): Promise<ProjectionRecordResult> {
  return await repairAnyPublicDerivedRow(ctx, row)
}

export async function repairPublicSearchRow(
  ctx: MutationCtx,
  row: Doc<'publicSearchEntries'>,
): Promise<ProjectionRecordResult> {
  return await repairAnyPublicDerivedRow(ctx, row)
}

async function getCollectionForRepair(ctx: QueryOrMutationCtx, collection: string) {
  return await getCollection(ctx, collection)
}

async function canonicalAssetRefSourceForRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'contentAssetRefs'>,
): Promise<AssetRefSource | null> {
  if (row.sourceKind === 'draft') {
    if (row.locale === null || row.locale === undefined) {
      const entry = await ctx.db.get(row.entryId)
      const source = entry ? draftSharedAssetRefSource(entry) : null
      return source?.sourceId === row.sourceId ? source : null
    }
    const draft = await ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', row.entryId).eq('locale', row.locale!),
      )
      .unique()
    const entry = draft ? await ctx.db.get(row.entryId) : null
    if (!draft || !entry) return null
    const source = draftLocaleAssetRefSource(draft)
    source.collection = entry.collection
    return source.sourceId === row.sourceId ? source : null
  }
  if (row.sourceKind === 'revision') {
    const separator = row.sourceId.lastIndexOf(':')
    const locale = separator < 1 ? '' : row.sourceId.slice(separator + 1)
    if (!locale) return null
    const revisionId = ctx.db.normalizeId('entryRevisions', row.sourceId.slice(0, separator))
    const revision = revisionId ? await ctx.db.get(revisionId) : null
    if (!revision || revision.entryId !== row.entryId) return null
    const source = revisionAssetRefSource(revision, locale)
    return source?.sourceId === row.sourceId ? source : null
  }
  if (!row.locale) return null
  const publicRow = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) =>
      query.eq('entryId', row.entryId).eq('locale', row.locale!),
    )
    .unique()
  if (!publicRow) return null
  const collection = await getCollectionForRepair(ctx, publicRow.collection)
  if (!collection) return null
  const source = await publicAssetRefSource(ctx, publicRow, collection)
  return source.sourceId === row.sourceId ? source : null
}

export async function repairAssetRefSourceForRow(
  ctx: MutationCtx,
  row: Doc<'contentAssetRefs'>,
): Promise<ProjectionRecordResult> {
  const result = emptyProjectionResult()
  const source = await canonicalAssetRefSourceForRow(ctx, row)
  if (source) {
    await replaceCanonicalAssetRefSource(ctx, source)
    result.repairedAssetRefSources += 1
  } else {
    await deleteAssetRefsForSource(ctx, row, 'repair')
    result.deletedOrphans += 1
  }
  return result
}

export async function verifyDerivedRowsForEntry(
  ctx: QueryOrMutationCtx,
  entry: EntryDoc,
  collection: CollectionDoc | null,
): Promise<ProjectionRepairIssue[]> {
  const issues: ProjectionRepairIssue[] = []
  if (!(await assetRefSourceMatches(ctx, draftSharedAssetRefSource(entry)))) {
    issues.push({
      code: 'draft-asset-ref-drift',
      entryId: String(entry._id),
      message: 'Shared draft asset references do not match canonical entry data.',
    })
  }
  if (!collection) {
    issues.push({
      code: 'collection-not-found',
      entryId: String(entry._id),
      message: 'Collection not found.',
    })
    return issues
  }
  for (const locale of collection.locales) {
    const draft = await ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id).eq('locale', locale))
      .unique()
    if (!(await draftSearchEntryMatches(ctx, entry, draft, collection, locale))) {
      issues.push({
        code: 'draft-search-drift',
        entryId: String(entry._id),
        locale,
        message: 'Draft search row does not match canonical draft data and versions.',
      })
    }
  }
  const activeLocales = new Set<string>()
  for (const publication of entry.activePublications) {
    if (activeLocales.has(publication.locale) || !collection.locales.includes(publication.locale)) {
      issues.push({
        code: 'invalid-active-publication-locale',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Active publication locale is duplicated or unsupported by the contract.',
      })
      continue
    }
    activeLocales.add(publication.locale)
    const expected = await expectedPublicProjection(ctx, entry, collection, publication)
    if (!expected.ok) {
      issues.push(expected.issue)
      continue
    }
    const row = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', entry._id).eq('locale', publication.locale),
      )
      .unique()
    if (!row || !(await publicDerivedRowsMatch(ctx, expected.built.input))) {
      issues.push({
        code: 'public-projection-drift',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Canonical active publication and public projection disagree.',
      })
      continue
    }
    if (!(await assetRefSourceMatches(ctx, await publicAssetRefSource(ctx, row, collection)))) {
      issues.push({
        code: 'public-asset-ref-drift',
        entryId: String(entry._id),
        locale: publication.locale,
        message: 'Public asset references do not match the public projection.',
      })
    }
  }
  return issues
}

export async function verifyDraftAssetRefsForRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'entryLocaleDrafts'>,
): Promise<ProjectionRepairIssue[]> {
  const entry = await ctx.db.get(row.entryId)
  if (!entry) {
    return [
      {
        code: 'draft-entry-missing',
        entryId: String(row.entryId),
        locale: row.locale,
        message: 'Localized draft points at a missing entry.',
      },
    ]
  }
  const source = draftLocaleAssetRefSource(row)
  source.collection = entry.collection
  const issues: ProjectionRepairIssue[] = []
  if (!(await assetRefSourceMatches(ctx, source))) {
    issues.push({
      code: 'draft-asset-ref-drift',
      entryId: String(row.entryId),
      locale: row.locale,
      message: 'Localized draft asset references do not match canonical draft data.',
    })
  }
  const collection = await getCollectionForRepair(ctx, entry.collection)
  if (!collection || !(await draftSearchEntryMatches(ctx, entry, row, collection))) {
    issues.push({
      code: 'draft-search-drift',
      entryId: String(row.entryId),
      locale: row.locale,
      message: 'Draft search row does not match canonical draft data and versions.',
    })
  }
  return issues
}

export async function verifyDraftSearchRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'draftSearchEntries'>,
): Promise<ProjectionRepairIssue[]> {
  const entry = await ctx.db.get(row.entryId)
  const draft = entry
    ? await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', row.entryId).eq('locale', row.locale),
        )
        .unique()
    : null
  const collection = entry ? await getCollectionForRepair(ctx, entry.collection) : null
  if (
    entry &&
    collection?.locales.includes(row.locale) &&
    (await draftSearchEntryMatches(ctx, entry, draft, collection, row.locale))
  ) {
    return []
  }
  return [
    {
      code:
        entry && collection?.locales.includes(row.locale)
          ? 'draft-search-drift'
          : 'orphan-draft-search-row',
      entryId: String(row.entryId),
      locale: row.locale,
      message:
        entry && collection?.locales.includes(row.locale)
          ? 'Draft search row does not match canonical draft data and versions.'
          : 'Draft search row has no canonical locale draft source.',
    },
  ]
}

export async function verifyRevisionAssetRefsForRow(
  ctx: QueryOrMutationCtx,
  revision: Doc<'entryRevisions'>,
): Promise<ProjectionRepairIssue[]> {
  const issues: ProjectionRepairIssue[] = []
  for (const locale of Object.keys(revision.snapshots).sort()) {
    const source = revisionAssetRefSource(revision, locale)
    if (source && !(await assetRefSourceMatches(ctx, source))) {
      issues.push({
        code: 'revision-asset-ref-drift',
        entryId: String(revision.entryId),
        locale,
        message: 'Revision asset references do not match the immutable snapshot.',
      })
    }
  }
  return issues
}

async function verifyAnyPublicDerivedRow(
  ctx: QueryOrMutationCtx,
  row: AnyPublicDerivedRow,
): Promise<ProjectionRepairIssue[]> {
  const entry = await ctx.db.get(row.entryId)
  const collection = entry ? await getCollectionForRepair(ctx, entry.collection) : null
  const publication = entry?.activePublications.find((item) => item.locale === row.locale)
  if (!entry || !collection || !publication) {
    return [
      {
        code: 'orphan-public-projection',
        entryId: String(row.entryId),
        locale: row.locale,
        message: 'Public row has no canonical active publication pointer.',
      },
    ]
  }
  const expected = await expectedPublicProjection(ctx, entry, collection, publication)
  if (!expected.ok) return [expected.issue]
  return (await publicDerivedRowsMatch(ctx, expected.built.input))
    ? []
    : [
        {
          code: 'public-projection-drift',
          entryId: String(row.entryId),
          locale: row.locale,
          message: 'Canonical active publication and public projection disagree.',
        },
      ]
}

export async function verifyPublicProjectionRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'publicEntries'>,
): Promise<ProjectionRepairIssue[]> {
  return await verifyAnyPublicDerivedRow(ctx, row)
}

export async function verifyPublicSearchRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'publicSearchEntries'>,
): Promise<ProjectionRepairIssue[]> {
  return await verifyAnyPublicDerivedRow(ctx, row)
}

export async function verifyAssetRefSourceForRow(
  ctx: QueryOrMutationCtx,
  row: Doc<'contentAssetRefs'>,
): Promise<ProjectionRepairIssue[]> {
  const source = await canonicalAssetRefSourceForRow(ctx, row)
  if (source && (await assetRefSourceMatches(ctx, source))) return []
  return [
    {
      code: source ? 'asset-ref-drift' : 'orphan-asset-ref',
      entryId: String(row.entryId),
      locale: row.locale ?? undefined,
      message: source
        ? 'Asset reference rows do not exactly match their canonical source.'
        : 'Asset reference row has no canonical source.',
    },
  ]
}

export async function getActivePublicPageByPath(
  ctx: QueryOrMutationCtx,
  collection: CollectionDoc,
  locale: string,
  path: string,
) {
  const route = await resolvePublicRoute(ctx, {
    collection: collection.slug,
    locale,
    path,
    options: {
      pathPrefix: pathPrefixForLocale(collection, locale),
      rootSlug: rootSlugForLocale(collection, locale),
    },
  })
  return route.kind === 'entry' ? route.row : null
}

export async function getActivePublicPageByStableId(
  ctx: QueryOrMutationCtx,
  collection: string,
  locale: string,
  stableId: string,
) {
  return await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_stableId', (q) =>
      q.eq('collection', collection).eq('locale', locale).eq('stableId', stableId),
    )
    .first()
}
