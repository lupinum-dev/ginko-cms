import {
  assertValidFinalPlacementGraph,
  CMS_TREE_MAX_DEPTH,
  finalPlacementKey,
  portableSharedDraftState,
  type FinalPlacementNode,
} from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import {
  hashCanonicalJson,
  validatePortableDocument,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'

import type { Doc } from '../_generated/dataModel.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import type { ImportRun } from './importModel.js'
import { assertImportPlanItemPayload } from './model.js'

type ImportItem = Extract<Doc<'portableItems'>, { mode: 'import' }>

async function plannedEntryRows(
  ctx: QueryOrMutationCtx,
  runId: string,
  collection: string,
  canonicalKey: string,
): Promise<ImportItem[]> {
  const rows = await ctx.db
    .query('portableItems')
    .withIndex('by_run_identity', (query) =>
      query.eq('runId', runId).eq('collection', collection).eq('canonicalKey', canonicalKey),
    )
    .collect()
  return rows.filter((row): row is ImportItem => row.mode === 'import')
}

async function finalPlannedNode(
  ctx: QueryOrMutationCtx,
  run: ImportRun,
  contract: Parameters<typeof validatePortableDocument>[1],
  collection: string,
  canonicalKey: string,
): Promise<{
  node: FinalPlacementNode
  document: PortableDocumentV1 | null
  minimumIndex: number | null
}> {
  const planned = await plannedEntryRows(ctx, run.runId, collection, canonicalKey)
  const collectionContract = contract.collections[collection]
  if (!collectionContract) throw new Error(`Portable collection "${collection}" is not installed.`)
  if (planned.length > 0) {
    const first = planned[0]!
    const firstPayload = assertImportPlanItemPayload(first.payload)
    const firstDocument = validatePortableDocument(first.document, contract)
    for (const row of planned) {
      const payload = assertImportPlanItemPayload(row.payload)
      const document = validatePortableDocument(row.document, contract)
      assertMdcBodyWithinLimit(document.body?.source ?? '', {
        locale: document.locale,
        field: 'bodyMdc',
      })
      if (
        document.collection !== collection ||
        document.canonicalKey !== canonicalKey ||
        payload.identity.collection !== collection ||
        payload.identity.canonicalKey !== canonicalKey
      ) {
        throw new Error('Portable final placement group identity is corrupt.')
      }
      if (
        payload.sharedSha256 !== firstPayload.sharedSha256 ||
        payload.expectedSharedSha256 !== firstPayload.expectedSharedSha256 ||
        (await hashCanonicalJson(portableSharedDraftState(document))) !== payload.sharedSha256
      ) {
        throw new Error('Portable final placement group has inconsistent shared state.')
      }
    }
    return {
      node: {
        key: finalPlacementKey(collection, canonicalKey),
        collection,
        parentKey:
          firstDocument.parentCanonicalKey === null
            ? null
            : finalPlacementKey(collection, firstDocument.parentCanonicalKey),
        structure: collectionContract.structure,
      },
      document: firstDocument,
      minimumIndex: Math.min(...planned.map((row) => row.index)),
    }
  }

  const entry = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collection', collection).eq('stableId', canonicalKey),
    )
    .first()
  if (!entry) {
    throw new Error(`Portable final placement parent "${canonicalKey}" does not exist.`)
  }
  const parent = entry.parentEntryId ? await ctx.db.get(entry.parentEntryId) : null
  return {
    node: {
      key: finalPlacementKey(collection, canonicalKey),
      collection,
      parentKey: parent ? finalPlacementKey(collection, parent.stableId) : null,
      structure: collectionContract.structure,
    },
    document: null,
    minimumIndex: null,
  }
}

async function assertFinalChain(
  ctx: QueryOrMutationCtx,
  run: ImportRun,
  contract: Parameters<typeof validatePortableDocument>[1],
  collection: string,
  canonicalKey: string,
): Promise<void> {
  const nodes: FinalPlacementNode[] = []
  const seen = new Set<string>()
  let currentCanonicalKey = canonicalKey
  while (true) {
    const resolved = await finalPlannedNode(ctx, run, contract, collection, currentCanonicalKey)
    const node = { ...resolved.node }
    nodes.push(node)
    if (nodes.length > CMS_TREE_MAX_DEPTH) {
      // Six known ancestors already prove the final graph is too deep. The
      // remaining ancestry cannot make it valid, so stop the bounded read here.
      node.parentKey = null
      break
    }
    if (node.parentKey === null) break
    if (seen.has(node.parentKey)) break
    seen.add(node.key)
    currentCanonicalKey = node.parentKey.slice(collection.length + 1)
  }
  assertValidFinalPlacementGraph(nodes)
}

export async function assertPortableFinalPlacementForRows(
  ctx: MutationCtx,
  run: ImportRun,
  rows: readonly ImportItem[],
  contract: Parameters<typeof validatePortableDocument>[1],
): Promise<void> {
  const groups = new Map<string, ImportItem[]>()
  for (const row of rows) {
    const key = finalPlacementKey(row.collection, row.canonicalKey)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    const first = group[0]!
    const resolved = await finalPlannedNode(
      ctx,
      run,
      contract,
      first.collection,
      first.canonicalKey,
    )
    if (resolved.document && resolved.document.parentCanonicalKey !== null) {
      const parent = await finalPlannedNode(
        ctx,
        run,
        contract,
        first.collection,
        resolved.document.parentCanonicalKey,
      )
      if (parent.minimumIndex !== null && parent.minimumIndex >= resolved.minimumIndex!) {
        throw new Error('Portable parent groups must be applied before their children.')
      }
    }
    await assertFinalChain(ctx, run, contract, first.collection, first.canonicalKey)
  }
}
