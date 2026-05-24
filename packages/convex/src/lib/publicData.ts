import type { JsonMap, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import { normalizeFields } from './fields.js'
import { buildSearchText } from './search.js'
import type { CmsField } from './types.js'
import { isPlainObject } from './utils.js'

export function getPublicFields(fields: CmsField[]): CmsField[] {
  return normalizeFields(fields)
    .filter((field) => !field.hidden)
    .map((field) => {
      if (!field.fields?.length) return field
      return {
        ...field,
        fields: getPublicFields(normalizeFields(field.fields)),
      }
    })
}

export function filterPublicData(fields: CmsField[], data: JsonMap): JsonMap {
  const publicData: JsonMap = {}

  for (const field of getPublicFields(fields)) {
    if (!Object.prototype.hasOwnProperty.call(data, field.key)) continue

    const value = data[field.key]
    if (field.type === 'object' && isPlainObject(value)) {
      publicData[field.key] = filterPublicData(
        normalizeFields(field.fields ?? []),
        value as JsonMap,
      )
      continue
    }

    if (field.type === 'array' && Array.isArray(value)) {
      publicData[field.key] = value.map((item) => {
        if (!isPlainObject(item)) return item as JsonValue
        return filterPublicData(normalizeFields(field.fields ?? []), item as JsonMap)
      }) as JsonValue
      continue
    }

    if (field.type === 'blocks' && Array.isArray(value)) {
      const blockFields = normalizeFields(field.fields ?? [])
      publicData[field.key] = value.map((item) => {
        if (!isPlainObject(item)) return item as JsonValue
        const blockType = typeof item.type === 'string' ? item.type : undefined
        const blockDef = blockFields.find((candidate) => candidate.key === blockType)
        if (!blockDef || !isPlainObject(item.data)) return item as JsonValue

        return {
          ...item,
          data: filterPublicData(normalizeFields(blockDef.fields ?? []), item.data as JsonMap),
        } as JsonValue
      }) as JsonValue
      continue
    }

    publicData[field.key] = value as JsonValue
  }

  return publicData
}

export function buildPublicSearchText(args: {
  values: JsonMap
  fields: CmsField[]
}): string | null {
  const fields = getPublicFields(args.fields)
  return buildSearchText({
    values: filterPublicData(fields, args.values),
    fields,
  })
}
