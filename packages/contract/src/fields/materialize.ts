import type { CmsField, JsonMap, JsonValue } from '../types.js'
import { isPlainObject, structuredCloneSafe } from '../utils.js'
import { normalizeFields } from './normalize.js'

function normalizeFieldValue(field: CmsField, value: unknown): JsonValue | undefined {
  if (value === undefined) {
    if (field.defaultValue !== undefined) {
      value = structuredCloneSafe(field.defaultValue)
    } else if (field.type === 'object') {
      value = {}
    } else if (
      field.type === 'array' ||
      field.type === 'blocks' ||
      field.type === 'images' ||
      field.type === 'relations' ||
      field.type === 'multiselect'
    ) {
      value = []
    }
  }

  if (field.type === 'object') {
    const next: JsonMap = isPlainObject(value) ? { ...(value as JsonMap) } : {}
    for (const nestedField of normalizeFields(field.fields ?? [])) {
      const nestedValue = normalizeFieldValue(nestedField, next[nestedField.key])
      if (nestedValue !== undefined) next[nestedField.key] = nestedValue
    }
    return next
  }

  if (field.type === 'array') {
    if (!Array.isArray(value)) return value as JsonValue | undefined
    return value.map((item) => {
      const next: JsonMap = isPlainObject(item) ? { ...(item as JsonMap) } : {}
      for (const nestedField of normalizeFields(field.fields ?? [])) {
        const nestedValue = normalizeFieldValue(nestedField, next[nestedField.key])
        if (nestedValue !== undefined) next[nestedField.key] = nestedValue
      }
      return next
    }) as JsonValue
  }

  if (field.type === 'blocks') {
    if (!Array.isArray(value)) return value as JsonValue | undefined
    return value.map((item) => {
      if (!isPlainObject(item)) return item
      const blockType = typeof item.type === 'string' ? item.type : undefined
      const blockDef = normalizeFields(field.fields ?? []).find(
        (candidate) => candidate.key === blockType,
      )
      const nextData: JsonMap = isPlainObject(item.data) ? { ...(item.data as JsonMap) } : {}
      for (const nestedField of normalizeFields(blockDef?.fields ?? [])) {
        const nestedValue = normalizeFieldValue(nestedField, nextData[nestedField.key])
        if (nestedValue !== undefined) nextData[nestedField.key] = nestedValue
      }
      return { ...item, data: nextData } as JsonValue
    }) as JsonValue
  }

  return value as JsonValue | undefined
}

export function materializeFieldData(
  fields: CmsField[],
  sharedData: JsonMap,
  localizedData: JsonMap,
): JsonMap {
  const merged: JsonMap = {}

  for (const field of fields) {
    const sourceValue = field.localized ? localizedData[field.key] : sharedData[field.key]
    const normalized = normalizeFieldValue(field, sourceValue)
    if (normalized !== undefined) {
      merged[field.key] = normalized
    }
  }

  return merged
}

export function filterSortableValues(fields: CmsField[], data: JsonMap): JsonMap {
  const sortable: JsonMap = {}
  for (const field of fields) {
    if (!field.sortable) continue
    sortable[field.key] = data[field.key] ?? null
  }
  return sortable
}
