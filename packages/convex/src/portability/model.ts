import { PORTABLE_IMPORT_LIMITS } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { canonicalJsonBytes, hashCanonicalJson } from '@lupinum/ginko-content/portability'

export const PORTABLE_RUN_TTL_MS = PORTABLE_IMPORT_LIMITS.durationMs
export const PORTABLE_PLAN_PAGE_LIMIT = 250
export const PORTABLE_DOCUMENT_LIMIT = PORTABLE_IMPORT_LIMITS.entries
export const PORTABLE_ASSET_LIMIT = 100_000
export const PORTABLE_ROW_BYTE_LIMIT = 256 * 1024
export const PORTABLE_ASSET_BYTE_LIMIT = 25 * 1024 * 1024

export type PortablePlanPayload = {
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

export function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 hash.`)
  }
}

export function assertImportPlanPayload(value: JsonMap): PortablePlanPayload {
  if (canonicalJsonBytes(value).length > PORTABLE_ROW_BYTE_LIMIT) {
    throw new Error('Portable plan payload exceeds 256 KiB.')
  }
  const payload = value as unknown as Partial<PortablePlanPayload>
  if (
    payload.format !== 'ginko-cms-portability-plan' ||
    payload.version !== 1 ||
    payload.mode !== 'import' ||
    typeof payload.deploymentId !== 'string' ||
    payload.deploymentId.length === 0 ||
    !isScope(payload.scope) ||
    !Number.isSafeInteger(payload.itemCount) ||
    payload.itemCount! < 0 ||
    payload.itemCount! > PORTABLE_DOCUMENT_LIMIT ||
    !Number.isSafeInteger(payload.assetCount) ||
    payload.assetCount! < 0 ||
    payload.assetCount! > PORTABLE_ASSET_LIMIT
  ) {
    throw new Error('Portable import plan payload is invalid.')
  }
  for (const [label, hash] of [
    ['targetContractSha256', payload.targetContractSha256],
    ['sourceManifestSha256', payload.sourceManifestSha256],
    ['sourceContractSha256', payload.sourceContractSha256],
    ['itemRootSha256', payload.itemRootSha256],
    ['assetRootSha256', payload.assetRootSha256],
  ] as const) {
    assertSha256(hash, label)
  }
  if (
    Object.keys(value).sort().join(',') !==
    [
      'assetCount',
      'assetRootSha256',
      'deploymentId',
      'format',
      'itemCount',
      'itemRootSha256',
      'mode',
      'scope',
      'sourceContractSha256',
      'sourceManifestSha256',
      'targetContractSha256',
      'version',
    ].join(',')
  ) {
    throw new Error('Portable import plan payload contains unknown fields.')
  }
  return payload as PortablePlanPayload
}

function isScope(value: unknown): value is { collections: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const collections = (value as { collections?: unknown }).collections
  return (
    Object.keys(value).length === 1 &&
    Array.isArray(collections) &&
    collections.length > 0 &&
    collections.every((entry) => typeof entry === 'string' && entry.length > 0) &&
    new Set(collections).size === collections.length &&
    collections.every((entry, index) => index === 0 || collections[index - 1]! < entry)
  )
}

export function assertImportPlanItemPayload(value: JsonMap): PortableImportPlanItemPayload {
  const payload = value as unknown as Partial<PortableImportPlanItemPayload>
  const identity = payload.identity
  if (
    Object.keys(value).sort().join(',') !==
      ['dependencyKeys', 'documentSha256', 'effect', 'expectedDraftSha256', 'identity'].join(',') ||
    Object.keys(identity ?? {})
      .sort()
      .join(',') !== ['canonicalKey', 'collection', 'locale'].join(',') ||
    !identity ||
    typeof identity.collection !== 'string' ||
    !identity.collection ||
    typeof identity.canonicalKey !== 'string' ||
    !identity.canonicalKey ||
    typeof identity.locale !== 'string' ||
    !identity.locale ||
    !['create', 'update', 'skip', 'conflict'].includes(String(payload.effect)) ||
    (payload.expectedDraftSha256 !== null && typeof payload.expectedDraftSha256 !== 'string') ||
    !Array.isArray(payload.dependencyKeys) ||
    payload.dependencyKeys.length > 256 ||
    payload.dependencyKeys.some((key) => typeof key !== 'string') ||
    payload.dependencyKeys.some(
      (key, index) => index > 0 && payload.dependencyKeys![index - 1]! >= key,
    )
  ) {
    throw new Error('Portable import plan item payload is invalid.')
  }
  if (canonicalJsonBytes(value).length > PORTABLE_ROW_BYTE_LIMIT) {
    throw new Error('Portable import plan item exceeds 256 KiB.')
  }
  assertSha256(payload.documentSha256, 'documentSha256')
  if (payload.expectedDraftSha256 !== null) {
    assertSha256(payload.expectedDraftSha256, 'expectedDraftSha256')
  }
  return payload as PortableImportPlanItemPayload
}

export function assertImportPlanAssetPayload(value: JsonMap): PortableImportPlanAssetPayload {
  const payload = value as unknown as Partial<PortableImportPlanAssetPayload>
  if (
    Object.keys(value).sort().join(',') !==
      ['bytes', 'effect', 'mediaType', 'referencedBy', 'sha256'].join(',') ||
    !Number.isSafeInteger(payload.bytes) ||
    payload.bytes! <= 0 ||
    payload.bytes! > PORTABLE_ASSET_BYTE_LIMIT ||
    !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(String(payload.mediaType)) ||
    !['upload', 'reuse', 'conflict'].includes(String(payload.effect)) ||
    !Array.isArray(payload.referencedBy) ||
    payload.referencedBy.length > 256 ||
    payload.referencedBy.some((key) => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) ||
    payload.referencedBy.some((key, index) => index > 0 && payload.referencedBy![index - 1]! >= key)
  ) {
    throw new Error('Portable import plan asset payload is invalid.')
  }
  if (canonicalJsonBytes(value).length > PORTABLE_ROW_BYTE_LIMIT) {
    throw new Error('Portable import plan asset exceeds 256 KiB.')
  }
  assertSha256(payload.sha256, 'asset sha256')
  return payload as PortableImportPlanAssetPayload
}

export async function matchesCanonicalHash(value: JsonMap, expected: string): Promise<boolean> {
  assertSha256(expected, 'hash')
  return (await hashCanonicalJson(value)) === expected
}
