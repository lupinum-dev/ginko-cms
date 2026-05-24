import type { CmsField, JsonMap, JsonValue } from '../types.js'

/**
 * Resolve the configured title field for a collection.
 * Checks `settings.titleField`, then a field keyed `title`,
 * then falls back to the first `text` field.
 */
export function resolveTitleFieldKey(
  fields: CmsField[],
  settings?: JsonValue | null,
): string | null {
  const settingsTitleField =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as JsonMap).titleField
      : undefined
  if (typeof settingsTitleField === 'string') return settingsTitleField

  const titleField = fields.find((field) => field.key === 'title')
  if (titleField) return 'title'

  const firstTextField = fields.find((field) => field.type === 'text')
  return firstTextField?.key ?? null
}

/**
 * Resolve the display title from merged entry data.
 */
export function resolveEntryTitle(
  data: JsonMap,
  fields: CmsField[],
  settings?: JsonValue | null,
): string {
  const titleFieldKey = resolveTitleFieldKey(fields, settings)
  if (!titleFieldKey) return ''
  const value = data[titleFieldKey]
  return typeof value === 'string' ? value : ''
}

/**
 * Resolve the configured description field for a collection.
 * Checks `settings.descriptionField`, then a field keyed `description`,
 * then falls back to the first textarea field.
 */
export function resolveDescriptionFieldKey(
  fields: CmsField[],
  settings?: JsonValue | null,
): string | null {
  const settingsDescriptionField =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as JsonMap).descriptionField
      : undefined
  if (typeof settingsDescriptionField === 'string') return settingsDescriptionField

  const descriptionField = fields.find((field) => field.key === 'description')
  if (descriptionField) return 'description'

  const firstTextareaField = fields.find((field) => field.type === 'textarea')
  return firstTextareaField?.key ?? null
}

/**
 * Resolve the public description from merged entry data.
 */
export function resolveEntryDescription(
  data: JsonMap,
  fields: CmsField[],
  settings?: JsonValue | null,
): string | null {
  const descriptionFieldKey = resolveDescriptionFieldKey(fields, settings)
  if (!descriptionFieldKey) return null
  const value = data[descriptionFieldKey]
  return typeof value === 'string' ? value : null
}
