import type { CmsField, FieldType, JsonObject } from '../types.js'

export function getFieldKey(field: Partial<CmsField> & { key?: string }): string {
  return field.key ?? ''
}

export function normalizeFieldType(type?: string): FieldType {
  if (type === 'string') return 'text'
  if (type === 'boolean') return 'checkbox'
  return (type ?? 'text') as FieldType
}

export function normalizeField(field: Partial<CmsField> & { key?: string }): CmsField {
  if (!field.key) {
    throw new Error('Field key is required')
  }

  return {
    key: field.key,
    type: normalizeFieldType(field.type),
    label: field.label ?? null,
    description: field.description ?? null,
    required: field.required ?? false,
    localized: field.localized ?? false,
    hidden: field.hidden ?? false,
    searchable: field.searchable ?? false,
    sortable: field.sortable ?? false,
    order: field.order ?? 0,
    width: field.width ?? 'full',
    defaultValue: field.defaultValue,
    validation: (field.validation as JsonObject | null | undefined) ?? null,
    condition: (field.condition as JsonObject | null | undefined) ?? null,
    options: field.options ?? null,
    relation: field.relation ?? null,
    media: field.media ?? null,
    fields: normalizeFields(field.fields ?? []),
    min: field.min ?? null,
    max: field.max ?? null,
    step: field.step ?? null,
    slugFrom: field.slugFrom ?? null,
    language: field.language ?? null,
  }
}

export function normalizeFields(fields: Array<Partial<CmsField>>): CmsField[] {
  return fields
    .map(normalizeField)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((field, index) => ({ ...field, order: index }))
}
