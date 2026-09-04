import { evaluateFieldCondition } from '@lupinum/ginko-cms-contract/shared/fields/conditions.js'
import { normalizeFields } from '@lupinum/ginko-cms-contract/shared/fields/normalize.js'
import type { FieldType } from '@lupinum/ginko-cms-contract/shared/types.js'

import { throwCmsError } from '../errors.js'
import type { CmsCollection, CmsField, CompletionState, ValidationError } from './types.js'
import { emptyForType, isPlainObject } from './utils.js'

export { evaluateFieldCondition }

export const MAX_FIELD_NESTING_DEPTH = 5
export const MAX_VALIDATION_REGEX_LENGTH = 200
export const CMS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CMS_LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i
export const SITE_DATA_KEY_PATTERN = /^[a-z][\w.-]*$/i
const FIELD_KEY_PATTERN = /^[a-z]\w*$/
const ACCEPT_MIME_PATTERN = /^[a-z0-9][\w!#$&^.+-]*\/(?:\*|[a-z0-9][\w!#$&^.+-]*)$/i
const ACCEPT_EXTENSION_PATTERN = /^\.[a-z0-9][\w-]*$/i
const ASPECT_RATIO_PATTERN = /^[1-9]\d*(?:\.\d+)?:[1-9]\d*(?:\.\d+)?$/
const FIELD_TYPES = new Set<FieldType>([
  'text',
  'textarea',
  'richtext',
  'slug',
  'email',
  'url',
  'number',
  'range',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'toggle',
  'date',
  'datetime',
  'time',
  'json',
  'object',
  'array',
  'blocks',
  'relation',
  'relations',
  'image',
  'images',
  'file',
  'icon',
  'code',
  'color',
  'divider',
  'section',
])

function validateScalarField(field: CmsField, value: unknown, path: string): ValidationError[] {
  if (value === undefined || value === null || value === '') return []

  const errors: ValidationError[] = []
  const validation = isPlainObject(field.validation) ? field.validation : {}

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'slug':
    case 'code':
    case 'icon':
      if (typeof value !== 'string') errors.push({ field: path, message: 'Must be a string' })
      break
    case 'email':
      if (typeof value !== 'string' || !isValidEmailAddress(value)) {
        errors.push({ field: path, message: 'Must be a valid email address' })
      }
      break
    case 'url':
      try {
        if (typeof value !== 'string') throw new Error('Invalid URL value')
        new URL(value)
      } catch {
        errors.push({ field: path, message: 'Must be a valid URL' })
      }
      break
    case 'color':
      if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
        errors.push({ field: path, message: 'Must be a valid hex color' })
      }
      break
    case 'number':
    case 'range':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push({ field: path, message: 'Must be a number' })
      }
      break
    case 'checkbox':
    case 'toggle':
      if (typeof value !== 'boolean') {
        errors.push({ field: path, message: 'Must be true or false' })
      }
      break
    case 'date':
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        errors.push({ field: path, message: 'Must be a valid ISO date' })
      }
      break
    case 'time':
      if (typeof value !== 'string' || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
        errors.push({ field: path, message: 'Must be a valid time' })
      }
      break
    case 'select':
    case 'radio':
      if (typeof value !== 'string') {
        errors.push({ field: path, message: 'Must be a string' })
      } else if (field.options?.length && !field.options.includes(value)) {
        errors.push({
          field: path,
          message: 'Must be one of the configured options',
        })
      }
      break
    case 'multiselect':
      if (!Array.isArray(value)) {
        errors.push({ field: path, message: 'Must be an array' })
      } else if (
        field.options?.length &&
        value.some((item) => !field.options?.includes(String(item)))
      ) {
        errors.push({ field: path, message: 'Contains an invalid option' })
      }
      break
    case 'relation':
    case 'image':
    case 'file':
      if (typeof value !== 'string')
        errors.push({ field: path, message: 'Must be a single reference' })
      break
    case 'relations':
    case 'images':
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        errors.push({ field: path, message: 'Must be a list of references' })
      }
      break
    default:
      break
  }

  if (typeof value === 'string') {
    const minLength = typeof validation.minLength === 'number' ? validation.minLength : undefined
    const maxLength = typeof validation.maxLength === 'number' ? validation.maxLength : undefined
    const regex = typeof validation.regex === 'string' ? validation.regex : undefined

    if (minLength !== undefined && value.length < minLength) {
      errors.push({
        field: path,
        message: `Must be at least ${minLength} characters`,
      })
    }
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push({
        field: path,
        message: `Must be at most ${maxLength} characters`,
      })
    }
    if (regex) {
      if (!isSafeValidationRegex(regex)) {
        errors.push({
          field: path,
          message: 'Uses an unsafe validation pattern',
        })
      } else if (!new RegExp(regex).test(value)) {
        errors.push({
          field: path,
          message: 'Does not match the required format',
        })
      }
    }
  }

  if (typeof value === 'number') {
    const min = typeof validation.min === 'number' ? validation.min : (field.min ?? undefined)
    const max = typeof validation.max === 'number' ? validation.max : (field.max ?? undefined)
    if (min !== undefined && value < min) {
      errors.push({ field: path, message: `Must be at least ${min}` })
    }
    if (max !== undefined && value > max) {
      errors.push({ field: path, message: `Must be at most ${max}` })
    }
  }

  if (Array.isArray(value)) {
    const minItems = typeof validation.minItems === 'number' ? validation.minItems : undefined
    const maxItems = typeof validation.maxItems === 'number' ? validation.maxItems : undefined
    if (minItems !== undefined && value.length < minItems) {
      errors.push({
        field: path,
        message: `Must have at least ${minItems} items`,
      })
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push({
        field: path,
        message: `Must have at most ${maxItems} items`,
      })
    }
  }

  return errors
}

function collectFieldValidation(
  fields: CmsField[],
  values: Record<string, unknown>,
  context: Record<string, unknown>,
  options: { publish: boolean; prefix?: string; depth?: number },
): ValidationError[] {
  const errors: ValidationError[] = []
  const prefix = options.prefix ?? ''
  const depth = options.depth ?? 0

  if (depth > MAX_FIELD_NESTING_DEPTH) {
    errors.push({
      field: prefix || '(root)',
      message: `Field nesting exceeds maximum depth of ${MAX_FIELD_NESTING_DEPTH}`,
    })
    return errors
  }

  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key
    const visible = evaluateFieldCondition(field.condition ?? undefined, context)
    const value = values[field.key]

    if (!visible) continue
    errors.push(...validateScalarField(field, value, path))

    if (options.publish && field.required && emptyForType(field.type, value)) {
      errors.push({ field: path, message: 'This field is required' })
    }

    if (field.type === 'object' && isPlainObject(value)) {
      errors.push(
        ...collectFieldValidation(normalizeFields(field.fields ?? []), value, context, {
          ...options,
          prefix: path,
          depth: depth + 1,
        }),
      )
    }

    if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (!isPlainObject(item)) return
        errors.push(
          ...collectFieldValidation(normalizeFields(field.fields ?? []), item, context, {
            ...options,
            prefix: `${path}.${index}`,
            depth: depth + 1,
          }),
        )
      })
    }
  }

  return errors
}

export function getFieldCompletionState(
  fields: CmsField[],
  data: Record<string, unknown>,
  context?: Record<string, unknown>,
): CompletionState {
  const effectiveContext = context ?? data
  let totalRequired = 0
  let filledRequired = 0

  for (const field of fields) {
    if (!field.required) continue
    if (!evaluateFieldCondition(field.condition ?? undefined, effectiveContext)) continue
    totalRequired += 1
    if (!emptyForType(field.type, data[field.key])) {
      filledRequired += 1
    }
  }

  const errors = collectFieldValidation(fields, data, effectiveContext, {
    publish: true,
  })
  return {
    filledRequired,
    totalRequired,
    complete: errors.length === 0 && filledRequired === totalRequired,
    errors,
  }
}

export type PublishRequiredFieldIssue = {
  field: string
  scope: 'localized' | 'shared'
  message: string
}

export function collectPublishRequiredFieldIssues(args: {
  collection: Pick<CmsCollection, 'fields'>
  localizedValues?: Record<string, unknown> | null
  sharedValues?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
}): PublishRequiredFieldIssue[] {
  const localizedFields: CmsField[] = []
  const sharedFields: CmsField[] = []
  for (const field of args.collection.fields) {
    if (field.localized) localizedFields.push(field)
    else sharedFields.push(field)
  }
  const data = args.data ?? {}
  const localizedValues = args.localizedValues ?? {}
  const sharedValues = args.sharedValues ?? {}
  const localized = getFieldCompletionState(localizedFields, localizedValues, data).errors.map(
    (error) => ({
      field: error.field,
      message: error.message,
      scope: 'localized' as const,
    }),
  )
  const shared = getFieldCompletionState(sharedFields, sharedValues, data).errors.map((error) => ({
    field: error.field,
    message: error.message,
    scope: 'shared' as const,
  }))
  return [...localized, ...shared]
}

export function assertFieldDataValid(
  fields: CmsField[],
  data: Record<string, unknown>,
  options: { publish?: boolean; context?: Record<string, unknown> } = {},
) {
  const errors = collectFieldValidation(fields, data, options.context ?? data, {
    publish: options.publish ?? false,
  })
  if (errors.length > 0) {
    throwCmsError(
      'VALIDATION_ERROR',
      errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      { errors },
    )
  }
}

function hasNestedQuantifier(pattern: string): boolean {
  let escaped = false
  let groupHasQuantifier = false
  let openDepth = 0

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (!char) continue

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '(') {
      openDepth += 1
      groupHasQuantifier = false
      continue
    }
    if (openDepth > 0 && (char === '*' || char === '+')) {
      groupHasQuantifier = true
      continue
    }
    if (openDepth > 0 && char === '{') {
      const end = pattern.indexOf('}', index + 1)
      if (end !== -1) {
        groupHasQuantifier = true
        index = end
        continue
      }
    }
    if (char === ')' && openDepth > 0) {
      openDepth -= 1
      if (!groupHasQuantifier) continue
      const next = pattern[index + 1]
      if (next === '*' || next === '+' || next === '{') {
        return true
      }
      groupHasQuantifier = false
    }
  }

  return false
}

function isValidEmailAddress(value: string): boolean {
  const atIndex = value.indexOf('@')
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false
  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  if (!local || !domain) return false
  if (/\s/.test(local) || /\s/.test(domain)) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  return labels.every((label) => label.length > 0)
}

export function isSafeValidationRegex(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_VALIDATION_REGEX_LENGTH) {
    return false
  }

  if (hasNestedQuantifier(pattern)) {
    return false
  }

  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function assertFieldDefinitionInvalid(
  code: string,
  path: string,
  message: string,
  details: Record<string, string | number | boolean | null> = {},
): never {
  throwCmsError(code, `Field "${path}" ${message}`, { field: path, ...details })
}

function assertChoiceOptionsValid(field: CmsField, path: string): void {
  const options = field.options ?? []
  if (options.length === 0) {
    assertFieldDefinitionInvalid(
      'FIELD_DEFINITION_INVALID_OPTIONS',
      path,
      'must define at least one option',
      { type: field.type },
    )
  }
  const seen = new Set<string>()
  for (const option of options) {
    if (typeof option !== 'string' || option.trim() === '') {
      assertFieldDefinitionInvalid(
        'FIELD_DEFINITION_INVALID_OPTIONS',
        path,
        'must define non-empty string options',
        { type: field.type },
      )
    }
    if (seen.has(option)) {
      assertFieldDefinitionInvalid(
        'FIELD_DEFINITION_INVALID_OPTIONS',
        path,
        'must not define duplicate options',
        { type: field.type, option },
      )
    }
    seen.add(option)
  }
}

function assertNestedFieldsValid(field: CmsField, path: string, depth: number): void {
  const nested = field.fields ?? []
  if (nested.length === 0) {
    assertFieldDefinitionInvalid(
      'FIELD_DEFINITION_INVALID_NESTED_FIELDS',
      path,
      'must define nested fields',
      { type: field.type },
    )
  }
  assertFieldDefinitionsValid(normalizeFields(nested), path, depth + 1)
}

function assertMediaConfigValid(field: CmsField, path: string): void {
  const media = field.media
  if (media == null) return
  if (field.type !== 'image' && field.type !== 'images' && field.type !== 'file') {
    assertFieldDefinitionInvalid(
      'FIELD_DEFINITION_INVALID_MEDIA',
      path,
      'must not define media config for a non-media field',
      { type: field.type },
    )
  }

  if (media.accept !== undefined) {
    if (
      media.accept.length === 0 ||
      media.accept.some(
        (value) =>
          typeof value !== 'string' ||
          (!ACCEPT_MIME_PATTERN.test(value) && !ACCEPT_EXTENSION_PATTERN.test(value)),
      )
    ) {
      assertFieldDefinitionInvalid(
        'FIELD_DEFINITION_INVALID_MEDIA',
        path,
        'must define valid media accept patterns',
        { type: field.type },
      )
    }
  }

  if (media.aspectRatio != null && !ASPECT_RATIO_PATTERN.test(media.aspectRatio)) {
    assertFieldDefinitionInvalid(
      'FIELD_DEFINITION_INVALID_MEDIA',
      path,
      'must define a valid image aspect ratio',
      { type: field.type },
    )
  }
}

export function assertFieldDefinitionsValid(fields: CmsField[], pathPrefix = '', depth = 0): void {
  if (depth > MAX_FIELD_NESTING_DEPTH) {
    throwCmsError(
      'FIELD_DEFINITION_NESTING_TOO_DEEP',
      `Field definitions exceed maximum nesting depth of ${MAX_FIELD_NESTING_DEPTH}`,
      { field: pathPrefix || '(root)', maxDepth: MAX_FIELD_NESTING_DEPTH },
    )
  }

  const fieldKeys = new Set<string>()
  for (const field of fields) {
    const path = pathPrefix ? `${pathPrefix}.${field.key}` : field.key
    if (!FIELD_KEY_PATTERN.test(field.key)) {
      assertFieldDefinitionInvalid('FIELD_DEFINITION_INVALID_KEY', path, 'has an invalid key')
    }
    if (fieldKeys.has(field.key)) {
      assertFieldDefinitionInvalid(
        'FIELD_DEFINITION_DUPLICATE_KEY',
        path,
        'duplicates another field key at the same level',
      )
    }
    fieldKeys.add(field.key)

    if (!FIELD_TYPES.has(field.type)) {
      assertFieldDefinitionInvalid(
        'FIELD_DEFINITION_INVALID_TYPE',
        path,
        'uses an unsupported type',
        { type: field.type },
      )
    }

    const regex = typeof field.validation?.regex === 'string' ? field.validation.regex : null
    if (regex && !isSafeValidationRegex(regex)) {
      throwCmsError(
        'FIELD_VALIDATION_REGEX_UNSAFE',
        `Field "${path}" uses an unsafe validation regex`,
        { field: path, regexLength: regex.length },
      )
    }

    if (field.type === 'select' || field.type === 'multiselect' || field.type === 'radio') {
      assertChoiceOptionsValid(field, path)
    }

    if (field.type === 'relation' || field.type === 'relations') {
      const relationCollection = field.relation?.collection
      if (typeof relationCollection !== 'string' || !CMS_SLUG_PATTERN.test(relationCollection)) {
        assertFieldDefinitionInvalid(
          'FIELD_DEFINITION_INVALID_RELATION',
          path,
          'must define a valid relation.collection slug',
          { type: field.type },
        )
      }
    }

    assertMediaConfigValid(field, path)

    if (field.type === 'object' || field.type === 'array' || field.type === 'blocks') {
      assertNestedFieldsValid(field, path, depth)
      continue
    }

    if (field.fields?.length) {
      assertFieldDefinitionsValid(normalizeFields(field.fields), path, depth + 1)
    }
  }
}

export function assertValidSlug(slug: string, code = 'ENTRY_INVALID_SLUG'): void {
  if (!CMS_SLUG_PATTERN.test(slug)) {
    throwCmsError(code, 'Slug must be lowercase alphanumeric with hyphens only', { slug })
  }
}

export function assertValidLocaleCode(locale: string, code = 'LOCALE_INVALID'): void {
  if (!CMS_LOCALE_PATTERN.test(locale)) {
    throwCmsError(code, 'Locale code is invalid', { locale })
  }
}

export function assertValidSiteDataKey(key: string): void {
  if (!SITE_DATA_KEY_PATTERN.test(key)) {
    throwCmsError(
      'SITE_DATA_KEY_INVALID',
      'Site data key must start with a letter and contain only letters, numbers, ".", "_" or "-"',
      { key },
    )
  }
}
