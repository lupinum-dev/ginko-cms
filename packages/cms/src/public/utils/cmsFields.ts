import { evaluateFieldCondition } from '@lupinum/ginko-cms-contract/shared/fields/conditions.js'
import { compareOrderRank } from '@lupinum/ginko-cms-contract/shared/order.js'

export { compareOrderRank }

/**
 * Cast an opaque Convex document `_id` to a plain string.
 *
 * Convex IDs are branded types at the type level but plain strings at runtime.
 * This helper isolates the single deliberate cast so callers never need
 * `_id as unknown as string`.
 */
export function toStringId(id: unknown): string {
  return id as string
}

type FieldLike = {
  key?: string
  type?: string
  label?: string | Record<string, unknown> | null
  required?: boolean
  hidden?: boolean
  condition?: Record<string, unknown> | null
  validation?: Record<string, unknown> | null
  fields?: FieldLike[] | null
  options?: string[] | null
}

type TranslateFn = (key: string, params?: Record<string, unknown>, defaultValue?: string) => string

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function formatFieldLabel(field: FieldLike): string {
  if (typeof field.label === 'string' && field.label.trim().length > 0) return field.label.trim()
  const key = field.key ?? ''
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/[-_]/g, ' ')
}

export function hasContentValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasContentValue(item))
  if (typeof value === 'string') return value.trim().length > 0
  if (isPlainObject(value)) return Object.values(value).some((item) => hasContentValue(item))
  return value !== undefined && value !== null
}

function emptyToUndefined(value: unknown): unknown {
  return value === undefined || value === null || value === '' ? undefined : value
}

function sanitizeFieldValue(field: FieldLike, value: unknown): unknown {
  const presentValue = emptyToUndefined(value)
  if (presentValue === undefined) return undefined

  if (field.type === 'select' || field.type === 'radio') {
    if (typeof presentValue !== 'string') return undefined
    return field.options?.length && !field.options.includes(presentValue) ? undefined : presentValue
  }

  if (field.type === 'multiselect') {
    if (!Array.isArray(presentValue)) return undefined
    const options = field.options ?? []
    const values = presentValue.filter(
      (item): item is string =>
        typeof item === 'string' && (!options.length || options.includes(item)),
    )
    return values.length ? values : undefined
  }

  if (field.type === 'object') {
    if (!isPlainObject(presentValue)) return undefined
    return buildCmsFieldData(field.fields ?? [], presentValue)
  }

  if (field.type === 'array') {
    if (!Array.isArray(presentValue)) return undefined
    const values = presentValue
      .map((item) =>
        isPlainObject(item) ? (buildCmsFieldData(field.fields ?? [], item) ?? undefined) : item,
      )
      .filter((item) => item !== undefined && item !== null && item !== '')
    return values.length ? values : undefined
  }

  return presentValue
}

export function buildCmsFieldData(
  fields: FieldLike[],
  source: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const data: Record<string, unknown> = {}
  for (const field of fields) {
    const key = field.key
    if (!key) continue
    const value = sanitizeFieldValue(field, source[key])
    if (value !== undefined) data[key] = value
  }
  return Object.keys(data).length > 0 ? data : undefined
}

function collectFieldErrors(
  fields: FieldLike[],
  data: Record<string, unknown>,
  context: Record<string, unknown>,
  t?: TranslateFn,
  prefix = '',
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = []

  for (const field of fields) {
    const key = field.key
    if (!key) continue
    if (field.hidden || !evaluateFieldCondition(field.condition, context)) continue

    const path = prefix ? `${prefix}.${key}` : key
    const value = data[key]

    if (field.required && !hasContentValue(value)) {
      errors.push({
        field: path,
        message:
          t?.(
            'ginkoCms.studio.collectionEditor.validationFieldRequired',
            { field: formatFieldLabel(field) },
            'This field is required',
          ) ?? 'This field is required',
      })
    }

    if (
      (field.type === 'select' || field.type === 'radio') &&
      hasContentValue(value) &&
      (typeof value !== 'string' ||
        Boolean(field.options?.length && !field.options.includes(value)))
    ) {
      errors.push({
        field: path,
        message: `${formatFieldLabel(field)} must be one of the configured options.`,
      })
    }

    if (field.type === 'multiselect' && Array.isArray(value) && field.options?.length) {
      const invalid = value.some(
        (item) => typeof item !== 'string' || !field.options?.includes(item),
      )
      if (invalid) {
        errors.push({
          field: path,
          message: `${formatFieldLabel(field)} contains an unsupported option.`,
        })
      }
    }

    if (field.type === 'object' && isPlainObject(value)) {
      errors.push(...collectFieldErrors(field.fields ?? [], value, value, t, path))
    }

    if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isPlainObject(item)) {
          errors.push(...collectFieldErrors(field.fields ?? [], item, item, t, `${path}[${index}]`))
        }
      })
    }

    if (field.type === 'blocks' && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (!isPlainObject(item)) return
        const blockType = typeof item.type === 'string' ? item.type : ''
        const blockField = (field.fields ?? []).find((candidate) => candidate.key === blockType)
        if (!blockField || !isPlainObject(item.data)) return
        errors.push(
          ...collectFieldErrors(
            blockField.fields ?? [],
            item.data,
            item.data,
            t,
            `${path}[${index}].data`,
          ),
        )
      })
    }
  }

  return errors
}

export function getClientValidationErrors(
  fields: FieldLike[],
  data: Record<string, unknown>,
  t?: TranslateFn,
) {
  return collectFieldErrors(fields, data, data, t)
}

export { evaluateFieldCondition }
