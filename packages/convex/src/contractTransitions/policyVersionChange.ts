import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  hashCanonicalJson,
  type PortableComponentPolicyV1,
  type PortableComponentPolicyV2,
  type ResolvedContentCollection,
  type ResolvedContentContract,
} from '@lupinum/ginko-content/cms-contract'

import type { readInstalledCmsContract } from '../lib/installedContract.js'
import type { TransitionInput, TransitionOutput, TransitionRun } from './model.js'

export type EligiblePolicyVersionChange = 'v1-to-v2' | 'v2-to-v1' | null

const v1TypeProjection = {
  string: ['string'],
  number: ['number'],
  boolean: ['boolean'],
  json: ['string', 'number', 'boolean', 'json'],
  asset: ['asset'],
} as const

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameKeys(left: object, right: object): boolean {
  return sameJson(Object.keys(left).sort(), Object.keys(right).sort())
}

function v2PreservesV1Policy(
  v1: PortableComponentPolicyV1,
  v2: PortableComponentPolicyV2,
): boolean {
  if (!sameKeys(v1.components, v2.components)) return false
  for (const [name, component] of Object.entries(v1.components)) {
    const replacement = v2.components[name]
    if (!replacement || component.kind !== replacement.kind) return false
    if (
      !sameJson(component.slots, replacement.slots) ||
      !sameJson(component.media, replacement.media)
    ) {
      return false
    }
    if (!sameKeys(component.props, replacement.props)) return false
    for (const [propName, prop] of Object.entries(component.props)) {
      const next = replacement.props[propName]
      if (
        !next ||
        prop.required !== next.required ||
        !sameJson(v1TypeProjection[prop.type], next.types)
      )
        return false
    }
  }
  return true
}

async function canonicalEqual(
  left: JsonObject | ResolvedContentCollection,
  right: JsonObject | ResolvedContentCollection,
): Promise<boolean> {
  return (
    (await hashCanonicalJson(left as unknown as JsonValue)) ===
    (await hashCanonicalJson(right as unknown as JsonValue))
  )
}

function contractBase(contract: ResolvedContentContract): JsonObject {
  return {
    format: contract.format,
    defaultLocale: contract.defaultLocale,
    locales: contract.locales,
    localeFallbacks: contract.localeFallbacks,
  } as unknown as JsonObject
}

function collectionBase(collection: ResolvedContentCollection): JsonObject {
  const { componentPolicy: _componentPolicy, ...base } = collection
  return base as unknown as JsonObject
}

export async function classifyNoWritePolicyVersionChange(
  current: ResolvedContentContract,
  target: ResolvedContentContract,
): Promise<EligiblePolicyVersionChange> {
  const direction =
    current.version === 1 && target.version === 2
      ? 'v1-to-v2'
      : current.version === 2 && target.version === 1
        ? 'v2-to-v1'
        : null
  if (!direction || !(await canonicalEqual(contractBase(current), contractBase(target))))
    return null
  if (!sameKeys(current.collections, target.collections)) return null
  for (const [slug, collection] of Object.entries(current.collections)) {
    const replacement = target.collections[slug]
    if (
      !replacement ||
      !(await canonicalEqual(collectionBase(collection), collectionBase(replacement)))
    ) {
      return null
    }
    const v1 = direction === 'v1-to-v2' ? collection.componentPolicy : replacement.componentPolicy
    const v2 = direction === 'v1-to-v2' ? replacement.componentPolicy : collection.componentPolicy
    if ('version' in v1 || !('version' in v2) || v2.version !== 2) return null
    if (!v2PreservesV1Policy(v1, v2)) return null
  }
  return direction
}

export async function noWritePolicyVersionChangeForRun(
  installed: NonNullable<Awaited<ReturnType<typeof readInstalledCmsContract>>>,
  run: TransitionRun,
  target: ResolvedContentContract,
): Promise<EligiblePolicyVersionChange> {
  if (run.fromPresentationHash !== run.toPresentationHash) return null
  return await classifyNoWritePolicyVersionChange(installed.content, target)
}

export function noWriteTransitionOutput(input: TransitionInput): TransitionOutput {
  return {
    slug: input.slug,
    parentEntryId: input.parentEntryId,
    orderRank: input.orderRank,
    nodeKind: input.nodeKind,
    shared: input.shared,
    locales: Object.fromEntries(
      Object.entries(input.locales).map(([locale, value]) => [
        locale,
        {
          slug: value.slug,
          values: value.values,
          bodyMdc: value.bodyMdc,
        },
      ]),
    ),
  }
}
