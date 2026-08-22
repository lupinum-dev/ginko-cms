import { PORTABLE_IMPORT_LIMITS } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import {
  assertValidFinalPlacementGraph,
  finalPlacementKey,
  portableSharedDraftState,
} from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import {
  collectPortableAssetReferences,
  collectPortableMdcAssetReferences,
  collectPortableReferences,
  canonicalJsonBytes,
  hashCanonicalJson,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'
import type { PortableDirectoryMetadata } from '@lupinum/ginko-content/portability/node'

export type PortableImportPlanItemPayload = {
  identity: { collection: string; canonicalKey: string; locale: string }
  expectedDraftSha256: string | null
  expectedSharedSha256: string | null
  effect: 'create' | 'update' | 'skip' | 'conflict'
  documentSha256: string
  sharedSha256: string
  dependencyKeys: string[]
}

export type PortableImportPlanAssetPayload = {
  sha256: string
  bytes: number
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  effect: 'upload' | 'reuse' | 'conflict'
  referencedBy: string[]
}

export type PortableDraftImportPlan = {
  payload: {
    format: 'ginko-cms-portability-plan'
    version: 1
    mode: 'import'
    deploymentId: string
    scope: { collections: string[] }
    targetContentHash: string
    sourceManifestSha256: string
    sourceContentHash: string
    itemCount: number
    itemRootSha256: string
    assetCount: number
    assetRootSha256: string
  }
  payloadSha256: string
  items: Array<{
    applyOrder: number
    itemKey: string
    inputSha256: string
    payload: PortableImportPlanItemPayload
    document: PortableDocumentV1
  }>
  assets: Array<{
    assetKey: string
    inputSha256: string
    payload: PortableImportPlanAssetPayload
  }>
  blockers: string[]
}

export async function createPortableDraftImportPlan(
  bundle: PortableDirectoryMetadata,
  options: {
    deploymentId: string
    targetContentHash: string
    currentDraftSha256ByItemKey: ReadonlyMap<string, string | null>
    currentSharedSha256ByItemKey: ReadonlyMap<string, string | null>
    currentAssetBySha256?: ReadonlyMap<
      string,
      {
        assetId: string
        bytes: number
        mediaType: string
      }
    >
  },
): Promise<PortableDraftImportPlan> {
  if (!options.deploymentId) throw new Error('Portable import requires a deployment ID.')
  assertSha256(options.targetContentHash, 'target content hash')
  if (bundle.documents.length > PORTABLE_IMPORT_LIMITS.entries) {
    throw new Error(`Portable import document count exceeds ${PORTABLE_IMPORT_LIMITS.entries}.`)
  }
  if (bundle.assets.length > PORTABLE_IMPORT_LIMITS.assets) {
    throw new Error(`Portable import asset count exceeds ${PORTABLE_IMPORT_LIMITS.assets}.`)
  }

  const documents = [...bundle.documents].sort((left, right) =>
    compareIdentity(left.document, right.document),
  )
  const localeCount = new Set(documents.map(({ document }) => document.locale)).size
  if (localeCount > PORTABLE_IMPORT_LIMITS.locales) {
    throw new Error(`Portable import locale count exceeds ${PORTABLE_IMPORT_LIMITS.locales}.`)
  }
  for (const { document } of documents) {
    if (canonicalJsonSize(document) > PORTABLE_IMPORT_LIMITS.documentBytes) {
      throw new Error('Portable import document exceeds 256 KiB.')
    }
  }
  const identityKeys = new Map<string, string>()
  for (const { document } of documents) {
    const identity = portableIdentity(document)
    identityKeys.set(identityLookup(identity), await hashJson(identity))
  }

  const items: PortableDraftImportPlan['items'] = []
  const blockers: string[] = []
  const referencedAssets = new Map<string, Set<string>>()
  for (const { document } of documents) {
    const identity = portableIdentity(document)
    const itemKey = await hashJson(identity)
    const documentSha256 = await hashJson(document)
    const sharedSha256 = await hashJson(portableSharedDraftState(document))
    const hasCurrent = options.currentDraftSha256ByItemKey.has(itemKey)
    const currentDraftSha256 = options.currentDraftSha256ByItemKey.get(itemKey) ?? null
    const hasCurrentShared = options.currentSharedSha256ByItemKey.has(itemKey)
    const currentSharedSha256 = options.currentSharedSha256ByItemKey.get(itemKey) ?? null
    if (!hasCurrent) blockers.push(`Current draft hash was not inspected for ${itemKey}.`)
    if (!hasCurrentShared) blockers.push(`Current shared hash was not inspected for ${itemKey}.`)
    if (currentDraftSha256 !== null) assertSha256(currentDraftSha256, 'current draft hash')
    if (currentSharedSha256 !== null) assertSha256(currentSharedSha256, 'current shared hash')
    const collection = bundle.contract.collections[document.collection]
    if (!collection) throw new Error(`Portable collection "${document.collection}" is missing.`)
    const dependencies = new Set<string>()
    if (document.parentCanonicalKey !== null) {
      const parent = identityKeys.get(
        identityLookup({
          collection: document.collection,
          canonicalKey: document.parentCanonicalKey,
          locale: document.locale,
        }),
      )
      if (!parent) throw new Error(`Portable parent for ${itemKey} is missing.`)
      dependencies.add(parent)
    }
    const references = collectPortableReferences(collection.fields, {
      ...document.shared,
      ...document.localized,
    })
    for (const reference of references) {
      const target = bundle.contract.collections[reference.collection]
      const dependency = target
        ? identityKeys.get(
            identityLookup({
              collection: reference.collection,
              canonicalKey: reference.canonicalKey,
              locale: target.defaultLocale,
            }),
          )
        : null
      if (!dependency) throw new Error(`Portable relation for ${itemKey} is missing.`)
      dependencies.add(dependency)
    }
    for (const reference of collectPortableAssetReferences(collection.fields, {
      ...document.shared,
      ...document.localized,
    })) {
      if (reference.kind !== 'local') continue
      dependencies.add(reference.sha256)
      const owners = referencedAssets.get(reference.sha256) ?? new Set<string>()
      owners.add(itemKey)
      referencedAssets.set(reference.sha256, owners)
    }
    if (document.body) {
      for (const reference of await collectPortableMdcAssetReferences(
        document.body.source,
        collection.componentPolicy,
      )) {
        dependencies.add(reference.sha256)
        const owners = referencedAssets.get(reference.sha256) ?? new Set<string>()
        owners.add(itemKey)
        referencedAssets.set(reference.sha256, owners)
      }
    }
    const payload: PortableImportPlanItemPayload = {
      identity,
      expectedDraftSha256: currentDraftSha256,
      expectedSharedSha256: currentSharedSha256,
      effect:
        !hasCurrent || currentDraftSha256 === null
          ? 'create'
          : currentDraftSha256 === documentSha256
            ? 'skip'
            : 'update',
      documentSha256,
      sharedSha256,
      dependencyKeys: [...dependencies].sort(compare),
    }
    items.push({
      applyOrder: -1,
      itemKey,
      inputSha256: await hashJson(payload),
      payload,
      document,
    })
  }
  assertPortableEntryGroups(items, bundle)
  items.sort((left, right) => compare(left.itemKey, right.itemKey))
  for (const [applyOrder, item] of dependencyOrder(items).entries()) item.applyOrder = applyOrder

  const assets: PortableDraftImportPlan['assets'] = []
  for (const asset of [...bundle.assets].sort((left, right) =>
    compare(left.sha256, right.sha256),
  )) {
    const current = options.currentAssetBySha256?.get(asset.sha256)
    const effect = !current
      ? 'upload'
      : current.bytes === asset.bytes && current.mediaType === asset.mediaType
        ? 'reuse'
        : 'conflict'
    const payload: PortableImportPlanAssetPayload = {
      sha256: asset.sha256,
      bytes: asset.bytes,
      mediaType: asset.mediaType,
      effect,
      referencedBy: [...(referencedAssets.get(asset.sha256) ?? [])].sort(compare),
    }
    assets.push({
      assetKey: asset.sha256,
      inputSha256: await hashJson(payload),
      payload,
    })
    if (effect === 'conflict') {
      blockers.push(`Portable asset ${asset.sha256} conflicts with stored metadata.`)
    }
  }

  const payload = {
    format: 'ginko-cms-portability-plan' as const,
    version: 1 as const,
    mode: 'import' as const,
    deploymentId: options.deploymentId,
    scope: {
      collections: [...new Set(documents.map(({ document }) => document.collection))].sort(compare),
    },
    targetContentHash: options.targetContentHash,
    sourceManifestSha256: await hashJson(bundle.manifest),
    sourceContentHash: bundle.manifest.contract.sha256,
    itemCount: items.length,
    itemRootSha256: await hashJson(items.map((item) => item.payload)),
    assetCount: assets.length,
    assetRootSha256: await hashJson(assets.map((asset) => asset.payload)),
  }
  return {
    payload,
    payloadSha256: await hashJson(payload),
    items,
    assets,
    blockers: [...new Set(blockers)],
  }
}

function dependencyOrder(items: PortableDraftImportPlan['items']) {
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const key = finalPlacementKey(
      item.payload.identity.collection,
      item.payload.identity.canonicalKey,
    )
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  for (const group of groups.values())
    group.sort((left, right) => compare(left.itemKey, right.itemKey))
  const groupByItemKey = new Map<string, string>()
  for (const [groupKey, group] of groups) {
    for (const item of group) groupByItemKey.set(item.itemKey, groupKey)
  }
  const permanent = new Set<string>()
  const active = new Set<string>()
  const ordered: typeof items = []
  const visit = (groupKey: string) => {
    if (permanent.has(groupKey)) return
    if (active.has(groupKey)) throw new Error('Portable plan dependencies contain a cycle.')
    const group = groups.get(groupKey)
    if (!group) return
    active.add(groupKey)
    const dependencies = new Set<string>()
    for (const item of group) {
      for (const dependency of item.payload.dependencyKeys) {
        const dependencyGroup = groupByItemKey.get(dependency)
        if (dependencyGroup && dependencyGroup !== groupKey) dependencies.add(dependencyGroup)
      }
    }
    for (const dependency of [...dependencies].sort(compare)) visit(dependency)
    active.delete(groupKey)
    permanent.add(groupKey)
    ordered.push(...group)
  }
  for (const groupKey of [...groups.keys()].sort(compare)) visit(groupKey)
  return ordered
}

function assertPortableEntryGroups(
  items: PortableDraftImportPlan['items'],
  bundle: PortableDirectoryBundle,
) {
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const key = finalPlacementKey(
      item.payload.identity.collection,
      item.payload.identity.canonicalKey,
    )
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  const nodes = []
  for (const [key, group] of groups) {
    const first = group[0]!
    if (group.some((item) => item.payload.sharedSha256 !== first.payload.sharedSha256)) {
      throw new Error(
        `Portable entry "${first.payload.identity.canonicalKey}" has inconsistent shared state across locales.`,
      )
    }
    if (
      group.some((item) => item.payload.expectedSharedSha256 !== first.payload.expectedSharedSha256)
    ) {
      throw new Error(
        `Portable entry "${first.payload.identity.canonicalKey}" was inspected from inconsistent shared states.`,
      )
    }
    const collection = bundle.contract.collections[first.document.collection]
    if (!collection)
      throw new Error(`Portable collection "${first.document.collection}" is missing.`)
    nodes.push({
      key,
      collection: first.document.collection,
      parentKey:
        first.document.parentCanonicalKey === null
          ? null
          : finalPlacementKey(first.document.collection, first.document.parentCanonicalKey),
      structure: collection.structure,
    })
  }
  assertValidFinalPlacementGraph(nodes)
}

function portableIdentity(document: PortableDocumentV1) {
  return {
    collection: document.collection,
    canonicalKey: document.canonicalKey,
    locale: document.locale,
  }
}

function identityLookup(identity: { collection: string; canonicalKey: string; locale: string }) {
  return `${identity.collection}\u0000${identity.canonicalKey}\u0000${identity.locale}`
}

function compareIdentity(left: PortableDocumentV1, right: PortableDocumentV1) {
  return compare(identityLookup(portableIdentity(left)), identityLookup(portableIdentity(right)))
}

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

async function hashJson(value: unknown): Promise<string> {
  return await hashCanonicalJson(value as JsonValue)
}

function canonicalJsonSize(value: unknown): number {
  return canonicalJsonBytes(value as JsonValue).length
}

function assertSha256(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Portable ${label} is not SHA-256.`)
}
