import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { getCollectionOrThrow } from '../lib/collections.js'
import type { QueryOrMutationCtx, VersionLocaleSnapshot, VersionSnapshot } from '../lib/types.js'
import { readStudioDraftView, type EntryDoc, type EntryRevisionDoc } from './context.js'

export async function createSnapshotFromState(
  ctx: QueryOrMutationCtx,
  entry: EntryDoc,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  state: 'draft' | 'published',
) {
  const snapshotLocales: Record<string, VersionLocaleSnapshot | null> = {}
  const draftView = await readStudioDraftView(ctx, entry, collection)

  if (state === 'draft') {
    for (const locale of draftView.locales) {
      snapshotLocales[locale.locale] = {
        slug: locale.draftSlug ?? draftView.baseSlug,
        path: locale.draftPath,
        shared: draftView.shared,
        values: locale.data,
      }
    }
  } else {
    for (const locale of draftView.locales) {
      if (!locale.published || !locale.publishedPath) continue
      snapshotLocales[locale.locale] = {
        slug: locale.publishedSlug,
        path: locale.publishedPath,
        shared: locale.publishedShared ?? {},
        values: locale.publishedData,
      }
    }
    for (const locale of collection.locales) {
      if (snapshotLocales[locale]) continue
      snapshotLocales[locale] = null
    }
  }

  for (const locale of collection.locales) {
    if (snapshotLocales[locale] !== undefined) {
      continue
    }
    snapshotLocales[locale] = null
  }

  return {
    baseSlug: draftView.baseSlug,
    stableId: entry.stableId ?? null,
    nodeKind: entry.nodeKind ?? null,
    parentEntryId: state === 'draft' ? draftView.parentEntryId : (entry.parentEntryId ?? null),
    orderRank: state === 'draft' ? draftView.orderRank : (entry.orderRank ?? null),
    // Shared draft values are compared against each locale's own active
    // publication snapshot. There is deliberately no global published-shared
    // value because locales can point at revisions created at different times.
    shared: {},
    locales: snapshotLocales,
  } satisfies VersionSnapshot
}

export function flattenSnapshot(snapshot: VersionSnapshot) {
  const flat: JsonMap = {
    'shared.baseSlug': snapshot.baseSlug,
    'shared.stableId': snapshot.stableId ?? null,
    'shared.nodeKind': snapshot.nodeKind ?? null,
    'shared.parentEntryId': snapshot.parentEntryId ?? null,
    'shared.orderRank': snapshot.orderRank ?? null,
    ...Object.fromEntries(
      Object.entries((snapshot.shared as JsonMap) ?? {}).map(([key, value]) => [
        `shared.${key}`,
        value,
      ]),
    ),
  }

  for (const [locale, localeSnapshot] of Object.entries(snapshot.locales ?? {})) {
    if (!localeSnapshot) {
      flat[`locale.${locale}`] = null
      continue
    }
    flat[`locale.${locale}.slug`] = localeSnapshot.slug ?? null
    flat[`locale.${locale}.path`] = localeSnapshot.path
    for (const [key, value] of Object.entries((localeSnapshot.shared as JsonMap) ?? {})) {
      flat[`locale.${locale}.shared.${key}`] = value
    }
    for (const [key, value] of Object.entries((localeSnapshot.values as JsonMap) ?? {})) {
      flat[`locale.${locale}.values.${key}`] = value
    }
  }

  return flat
}

export function flattenRevisionSnapshot(snapshots: EntryRevisionDoc['snapshots']) {
  const flat: JsonMap = {}
  for (const [locale, localeSnapshot] of Object.entries(snapshots)) {
    flat[`locale.${locale}.slug`] = localeSnapshot.slug
    flat[`locale.${locale}.parentEntryId`] = localeSnapshot.parentEntryId
      ? String(localeSnapshot.parentEntryId)
      : null
    flat[`locale.${locale}.orderRank`] = localeSnapshot.orderRank
    for (const [key, value] of Object.entries(localeSnapshot.shared as JsonMap)) {
      flat[`locale.${locale}.shared.${key}`] = value
    }
    for (const [key, value] of Object.entries((localeSnapshot.values as JsonMap) ?? {})) {
      flat[`locale.${locale}.values.${key}`] = value
    }
  }

  return flat
}
