import type { JsonMap, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import { normalizeFields } from '../lib/fields.js'
import type { CmsField } from '../lib/types.js'
import { isPlainObject } from '../lib/utils.js'

export type RelationReference = {
  fieldPath: string
  targetCollectionSlug: string | null
  targetId: string
}

type RelationTransformHandlers = {
  relation: (field: CmsField, value: unknown) => Promise<JsonValue>
  relations: (field: CmsField, value: unknown) => Promise<JsonValue>
}

function relationTargetIdsFromValue(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value]
  if (Array.isArray(value)) return value.flatMap(relationTargetIdsFromValue)
  if (isPlainObject(value)) {
    const candidates = [value.stableId, value.id, value._id, value.entryId, value.value]
    return candidates.filter((item): item is string => typeof item === 'string' && !!item)
  }
  return []
}

export function collectRelationReferences(args: {
  fields: CmsField[]
  data: Record<string, unknown>
  prefix?: string
}): RelationReference[] {
  const references: RelationReference[] = []

  for (const field of normalizeFields(args.fields)) {
    const fieldPath = args.prefix ? `${args.prefix}.${field.key}` : field.key
    const value = args.data[field.key]

    if (field.type === 'relation' || field.type === 'relations') {
      for (const targetId of relationTargetIdsFromValue(value)) {
        references.push({
          fieldPath,
          targetCollectionSlug: field.relation?.collectionId ?? null,
          targetId,
        })
      }
      continue
    }

    if (field.type === 'object' && isPlainObject(value)) {
      references.push(
        ...collectRelationReferences({
          fields: field.fields ?? [],
          data: value as Record<string, unknown>,
          prefix: fieldPath,
        }),
      )
      continue
    }

    if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (!isPlainObject(item)) return
        references.push(
          ...collectRelationReferences({
            fields: field.fields ?? [],
            data: item as Record<string, unknown>,
            prefix: `${fieldPath}.${index}`,
          }),
        )
      })
      continue
    }

    if (field.type === 'blocks' && Array.isArray(value)) {
      const blockFields = normalizeFields(field.fields ?? [])
      value.forEach((item, index) => {
        if (!isPlainObject(item)) return
        const blockType = typeof item.type === 'string' ? item.type : null
        const blockDefinition = blockType
          ? blockFields.find((candidate) => candidate.key === blockType)
          : null
        const blockData = isPlainObject(item.data) ? item.data : item
        references.push(
          ...collectRelationReferences({
            fields: blockDefinition?.fields ?? blockFields,
            data: blockData as Record<string, unknown>,
            prefix: blockType ? `${fieldPath}.${index}.${blockType}` : `${fieldPath}.${index}`,
          }),
        )
      })
    }
  }

  return references
}

async function transformStructuredData(
  fields: CmsField[],
  data: JsonMap,
  handlers: RelationTransformHandlers,
): Promise<JsonMap> {
  const next: JsonMap = { ...data }

  for (const field of normalizeFields(fields)) {
    if (!Object.prototype.hasOwnProperty.call(data, field.key)) continue
    const value = next[field.key]

    if (field.type === 'relation') {
      next[field.key] = await handlers.relation(field, value)
      continue
    }

    if (field.type === 'relations') {
      next[field.key] = await handlers.relations(field, value)
      continue
    }

    if (field.type === 'object' && isPlainObject(value)) {
      next[field.key] = await transformStructuredData(
        normalizeFields(field.fields ?? []),
        value as JsonMap,
        handlers,
      )
      continue
    }

    if (field.type === 'array' && Array.isArray(value)) {
      next[field.key] = await Promise.all(
        value.map(async (item) => {
          if (!isPlainObject(item)) return item as JsonValue
          return (await transformStructuredData(
            normalizeFields(field.fields ?? []),
            item as JsonMap,
            handlers,
          )) as JsonValue
        }),
      )
      continue
    }

    if (field.type === 'blocks' && Array.isArray(value)) {
      const blockFields = normalizeFields(field.fields ?? [])
      next[field.key] = await Promise.all(
        value.map(async (item) => {
          if (!isPlainObject(item)) return item as JsonValue
          const blockType = typeof item.type === 'string' ? item.type : undefined
          const blockDef = blockFields.find((candidate) => candidate.key === blockType)
          if (!blockDef || !isPlainObject(item.data)) return item as JsonValue

          return {
            ...item,
            data: await transformStructuredData(
              normalizeFields(blockDef.fields ?? []),
              item.data as JsonMap,
              handlers,
            ),
          } as JsonValue
        }),
      )
    }
  }

  return next
}

type StableRelationLookup = {
  stableIds: Set<string>
}

export async function rewriteStoredRelationData(
  fields: CmsField[],
  data: JsonMap,
  resolveLookup: (collectionSlug: string) => Promise<StableRelationLookup | null>,
): Promise<JsonMap> {
  return await transformStructuredData(fields, data, {
    relation: async (field, value) => {
      if (typeof value !== 'string' || !value) return null
      const relationCollectionSlug = field.relation?.collectionId
      if (!relationCollectionSlug) return null
      const lookup = await resolveLookup(relationCollectionSlug)
      if (!lookup) return null
      return lookup.stableIds.has(value) ? value : null
    },
    relations: async (field, value) => {
      if (!Array.isArray(value)) return []
      const relationCollectionSlug = field.relation?.collectionId
      if (!relationCollectionSlug) return []
      const lookup = await resolveLookup(relationCollectionSlug)
      if (!lookup) return []

      const normalized: string[] = []
      for (const item of value) {
        if (typeof item !== 'string' || !item) continue
        if (lookup.stableIds.has(item)) {
          normalized.push(item)
          continue
        }
      }
      return normalized
    },
  })
}
