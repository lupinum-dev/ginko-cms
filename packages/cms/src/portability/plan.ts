import { PORTABLE_IMPORT_LIMITS } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import {
  collectPortableAssetReferences,
  collectPortableMdcAssetReferences,
  collectPortableReferences,
  canonicalJsonBytes,
  hashCanonicalJson,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'
import type { PortableDirectoryBundle } from '@lupinum/ginko-content/portability/node'

export type PortableImportPlanItemPayload = {
  identity: { collection: string; canonicalKey: string; locale: string }
  expectedDraftSha256: string | null
  effect: 'create' | 'update' | 'skip' | 'conflict'
  documentSha256: string
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
    targetContractSha256: string
    sourceManifestSha256: string
    sourceContractSha256: string
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
  bundle: PortableDirectoryBundle,
  options: {
    deploymentId: string
    targetContractSha256: string
    currentDraftSha256ByItemKey: ReadonlyMap<string, string | null>
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
  assertSha256(options.targetContractSha256, 'target contract hash')
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
    if (
      canonicalJsonBytes(document as unknown as JsonValue).length >
      PORTABLE_IMPORT_LIMITS.documentBytes
    ) {
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
    const hasCurrent = options.currentDraftSha256ByItemKey.has(itemKey)
    const currentDraftSha256 = options.currentDraftSha256ByItemKey.get(itemKey) ?? null
    if (!hasCurrent) blockers.push(`Current draft hash was not inspected for ${itemKey}.`)
    if (currentDraftSha256 !== null) assertSha256(currentDraftSha256, 'current draft hash')
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
      effect:
        !hasCurrent || currentDraftSha256 === null
          ? 'create'
          : currentDraftSha256 === documentSha256
            ? 'skip'
            : 'update',
      documentSha256,
      dependencyKeys: [...dependencies].sort(compare),
    }
    items.push({ applyOrder: -1, itemKey, inputSha256: await hashJson(payload), payload, document })
  }
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
    targetContractSha256: options.targetContractSha256,
    sourceManifestSha256: await hashJson(bundle.manifest),
    sourceContractSha256: bundle.manifest.contract.sha256,
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
  const byKey = new Map(items.map((item) => [item.itemKey, item]))
  const permanent = new Set<string>()
  const active = new Set<string>()
  const ordered: typeof items = []
  const visit = (itemKey: string) => {
    if (permanent.has(itemKey)) return
    if (active.has(itemKey)) throw new Error('Portable plan dependencies contain a cycle.')
    const item = byKey.get(itemKey)
    if (!item) return
    active.add(itemKey)
    for (const dependency of item.payload.dependencyKeys) visit(dependency)
    active.delete(itemKey)
    permanent.add(itemKey)
    ordered.push(item)
  }
  for (const item of items) visit(item.itemKey)
  return ordered
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

function assertSha256(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Portable ${label} is not SHA-256.`)
}
