import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { projectContentCollection, readInstalledCmsContract } from '../lib/installedContract.js'
import type { CmsField, QueryOrMutationCtx } from '../lib/types.js'
import { collectRelationReferences } from './relations.js'

const MAX_SUPPORTED_ENTRIES = 1_500
const MAX_LISTED_REFERENCES = 25

export type InboundRelationReference = {
  sourceEntryId: string
  sourceCollection: string
  locale: string | null
  source: 'draft' | 'publication'
  fieldPath: string
}

function fieldsCanReferenceCollection(fields: CmsField[], targetCollection: string): boolean {
  for (const field of fields) {
    if (
      (field.type === 'relation' || field.type === 'relations') &&
      field.relation?.collection === targetCollection
    ) {
      return true
    }
    if (field.fields?.length && fieldsCanReferenceCollection(field.fields, targetCollection)) {
      return true
    }
  }
  return false
}

function matchingReferences(args: {
  fields: CmsField[]
  values: JsonMap
  targetCollection: string
  targetStableId: string
}) {
  return collectRelationReferences({ fields: args.fields, data: args.values }).filter(
    (reference) =>
      reference.targetCollectionSlug === args.targetCollection &&
      reference.targetId === args.targetStableId,
  )
}

/**
 * Inspect the complete current editorial/public relation graph before an entry
 * can be removed. Historical, inactive revisions remain history and are not
 * treated as live inbound dependencies.
 */
export async function inspectInboundEntryRelations(
  ctx: QueryOrMutationCtx,
  target: Pick<Doc<'entries'>, '_id' | 'collection' | 'stableId'>,
): Promise<{
  total: number
  listed: InboundRelationReference[]
  scannedEntries: number
}> {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throwCmsError('CMS_CONTRACT_MISSING', 'No CMS contract is installed.')

  const rows = await ctx.db.query('entries').take(MAX_SUPPORTED_ENTRIES + 1)
  if (rows.length > MAX_SUPPORTED_ENTRIES) {
    throwCmsError(
      'CMS_SCALE_LIMIT_EXCEEDED',
      `Inbound relation verification supports at most ${MAX_SUPPORTED_ENTRIES} entries.`,
      { maxEntries: MAX_SUPPORTED_ENTRIES },
    )
  }

  const candidateCollections = new Map<string, CmsField[]>()
  for (const [slug, contentCollection] of Object.entries(installed.content.collections)) {
    const collection = projectContentCollection(contentCollection, {
      contentHash: installed.record.contentHash,
      presentation: installed.record.presentation,
      installedAt: installed.record.installedAt,
      installedBy: installed.record.installedBy,
    })
    if (fieldsCanReferenceCollection(collection.fields, target.collection)) {
      candidateCollections.set(slug, collection.fields)
    }
  }

  const listed: InboundRelationReference[] = []
  const seen = new Set<string>()
  let total = 0
  const record = (reference: InboundRelationReference) => {
    const key = [
      reference.sourceEntryId,
      reference.locale ?? '',
      reference.source,
      reference.fieldPath,
    ].join('\u0000')
    if (seen.has(key)) return
    seen.add(key)
    total += 1
    if (listed.length < MAX_LISTED_REFERENCES) listed.push(reference)
  }

  for (const entry of rows) {
    if (entry._id === target._id) continue
    const fields = candidateCollections.get(entry.collection)
    if (!fields) continue

    const drafts = await ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .collect()
    const draftsByLocale = new Map(drafts.map((draft) => [draft.locale, draft]))
    if (drafts.length === 0) {
      for (const relation of matchingReferences({
        fields,
        values: entry.shared,
        targetCollection: target.collection,
        targetStableId: target.stableId,
      })) {
        record({
          sourceEntryId: String(entry._id),
          sourceCollection: entry.collection,
          locale: null,
          source: 'draft',
          fieldPath: relation.fieldPath,
        })
      }
    }
    for (const draft of drafts) {
      for (const relation of matchingReferences({
        fields,
        values: { ...entry.shared, ...draft.values },
        targetCollection: target.collection,
        targetStableId: target.stableId,
      })) {
        record({
          sourceEntryId: String(entry._id),
          sourceCollection: entry.collection,
          locale: draft.locale,
          source: 'draft',
          fieldPath: relation.fieldPath,
        })
      }
    }

    const revisionCache = new Map<string, Doc<'entryRevisions'> | null>()
    for (const publication of entry.activePublications) {
      const currentDraft = draftsByLocale.get(publication.locale)
      if (
        publication.sharedVersion === entry.sharedVersion &&
        publication.localeVersion === currentDraft?.version
      ) {
        continue
      }
      const revisionKey = String(publication.revisionId)
      let revision = revisionCache.get(revisionKey)
      if (revision === undefined) {
        revision = await ctx.db.get(publication.revisionId)
        revisionCache.set(revisionKey, revision)
      }
      const snapshot = revision?.snapshots[publication.locale]
      if (!snapshot) {
        throwCmsError(
          'PUBLIC_PROJECTION_REBUILD_REQUIRED',
          'An active publication is missing its immutable relation snapshot.',
          { entryId: String(entry._id), locale: publication.locale },
        )
      }
      for (const relation of matchingReferences({
        fields,
        values: { ...snapshot.shared, ...snapshot.values },
        targetCollection: target.collection,
        targetStableId: target.stableId,
      })) {
        record({
          sourceEntryId: String(entry._id),
          sourceCollection: entry.collection,
          locale: publication.locale,
          source: 'publication',
          fieldPath: relation.fieldPath,
        })
      }
    }
  }

  return { total, listed, scannedEntries: rows.length }
}
