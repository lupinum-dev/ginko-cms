import type {
  CmsField,
  FieldCondition,
  FieldType,
  JsonObject,
  JsonValue,
} from '@lupinum/ginko-cms-contract/shared/types.js'

import type { StudioAssetContext } from '../../../composables/internal/types'

export type FieldDefinition = CmsField
export type FieldContext = Record<string, unknown>

export interface FieldProps {
  field: FieldDefinition
  modelValue: JsonValue | undefined
  context?: FieldContext
  locale?: string
  assetContext?: StudioAssetContext
  errors?: Array<{ field: string; message: string }>
  label: string
  fieldError: string | null
}

export function asFieldContext(value: unknown): FieldContext {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as FieldContext
  }
  return {}
}

export function formatLabel(key: string): string {
  return key
    .replace(/Mdc$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/[-_]/g, ' ')
    .trim()
}

export function getDefault(type: FieldType, fields?: FieldDefinition[]): JsonValue {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'slug':
    case 'email':
    case 'url':
    case 'select':
    case 'radio':
    case 'date':
    case 'datetime':
    case 'time':
    case 'relation':
    case 'image':
    case 'file':
    case 'icon':
    case 'code':
    case 'color':
    case 'divider':
    case 'section':
      return ''
    case 'checkbox':
    case 'toggle':
      return false
    case 'number':
    case 'range':
      return 0
    case 'multiselect':
    case 'images':
    case 'relations':
    case 'array':
    case 'blocks':
      return []
    case 'json':
      return {}
    case 'object':
      return createDefaultRecord(fields)
  }
}

export function createDefaultRecord(fields: FieldDefinition[] = []): JsonObject {
  const record: JsonObject = {}
  for (const field of fields) {
    record[field.key] = field.defaultValue ?? getDefault(field.type, field.fields ?? undefined)
  }
  return record
}

export function getConditionHint(
  condition: FieldCondition | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (!condition) return null
  if (typeof condition.field === 'string' && condition.equals !== undefined)
    return t('ginkoCms.studio.fieldRenderer.shownWhenEquals', {
      field: condition.field,
      value: JSON.stringify(condition.equals),
    })
  if (typeof condition.field === 'string' && condition.truthy)
    return t('ginkoCms.studio.fieldRenderer.shownWhenTruthy', {
      field: condition.field,
    })
  return t('ginkoCms.studio.fieldRenderer.conditional')
}

export function getClientFieldError(
  field: FieldDefinition,
  value: unknown,
  label: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (field.required) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return t('ginkoCms.studio.fieldRenderer.requiredField', { field: label })
    }
  }
  if (
    field.type === 'email' &&
    typeof value === 'string' &&
    value &&
    !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(value)
  ) {
    return t('ginkoCms.studio.fieldRenderer.invalidEmail')
  }
  if (field.type === 'url' && typeof value === 'string' && value) {
    try {
      new URL(value)
    } catch {
      return t('ginkoCms.studio.fieldRenderer.invalidUrl')
    }
  }
  if ((field.type === 'number' || field.type === 'range') && typeof value === 'number') {
    if (field.min != null && value < field.min)
      return t('ginkoCms.studio.fieldRenderer.minimumValue', {
        value: field.min,
      })
    if (field.max != null && value > field.max)
      return t('ginkoCms.studio.fieldRenderer.maximumValue', {
        value: field.max,
      })
  }
  if (
    field.type === 'color' &&
    typeof value === 'string' &&
    value &&
    !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
  ) {
    return t('ginkoCms.studio.fieldRenderer.invalidColor')
  }
  return null
}
