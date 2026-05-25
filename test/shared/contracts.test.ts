import { createEntry, publishEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  fieldValidator,
  ginkoPublishImpactResultValidator,
  ginkoRouteDiagnosticCodeValidator,
  ginkoSingletonResultValidator,
  ginkoVisibilityDiagnosticCodeValidator,
  jsonObjectValidator,
  jsonValueValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { describe, expect, it } from 'vitest'

function validatorFields(validator: unknown): Record<string, unknown> {
  if (validator && typeof validator === 'object') {
    const fields = (validator as { fields?: Record<string, unknown> }).fields
    return fields ?? (validator as Record<string, unknown>)
  }
  return {}
}

function validatorLiteralValues(validator: unknown): string[] {
  const record = validator as { kind?: string; value?: unknown; members?: unknown[] }
  if (record.kind === 'literal' && typeof record.value === 'string') return [record.value]
  if (record.kind !== 'union') return []
  return (record.members ?? []).flatMap(validatorLiteralValues)
}

type ValidatorShape = {
  element?: unknown
  fields?: Record<string, unknown>
  isOptional?: string
  kind?: string
  members?: unknown[]
  value?: unknown
}

function validatorShape(validator: unknown): ValidatorShape {
  return validator && typeof validator === 'object' ? (validator as ValidatorShape) : {}
}

describe('shared contracts', () => {
  it('exports namespaced permission keys', () => {
    expect(cmsPermissionKeys).toEqual({
      read: 'cms.read',
      bootstrap: 'cms.bootstrap',
      createEntries: 'cms.entries.create',
      editEntries: 'cms.entries.edit',
      publishEntries: 'cms.entries.publish',
      archiveEntries: 'cms.entries.archive',
      deleteEntries: 'cms.entries.delete',
      manageCollections: 'cms.collections.manage',
      manageSettings: 'cms.settings.manage',
      manageMembers: 'cms.members.manage',
      manageAssets: 'cms.assets.manage',
    })
  })

  it('exports shared editor schemas with explicit public args and MCP labels', () => {
    expect(Object.keys(validatorFields(createEntry.args)).sort()).toEqual([
      'collection',
      'locale',
      'localized',
      'nodeKind',
      'orderRank',
      'parentEntryId',
      'shared',
      'slug',
    ])
    expect(Object.keys(validatorFields(publishEntry.args)).sort()).toEqual([
      'entryId',
      'expectedVersion',
      'locales',
      'message',
    ])
    expect(createEntry.meta.fields.slug?.examples).toEqual(['getting-started', 'release-notes'])
    expect(publishEntry.meta.fields.locales?.examples).toEqual([['en']])
    expect(publishEntry.args.previewConfirmation).toBeUndefined()
    expect('parse' in createEntry).toBe(false)
    expect('validate' in createEntry).toBe(false)
  })

  it('accepts null in canonical optional field validators', () => {
    const fields = validatorFields(fieldValidator)
    const descriptionValidator = validatorShape(fields.description)
    const optionsValidator = validatorShape(fields.options)
    const relationValidator = validatorShape(fields.relation)
    const slugFromValidator = validatorShape(fields.slugFrom)

    for (const validator of [
      descriptionValidator,
      optionsValidator,
      relationValidator,
      slugFromValidator,
    ]) {
      expect(validator.isOptional).toBe('optional')
      expect(validator.kind).toBe('union')
      expect(validator.members?.some((member) => validatorShape(member).kind === 'null')).toBe(true)
    }
  })

  it('keeps route diagnostic codes accepted by visibility diagnostics', () => {
    const routeCodes = validatorLiteralValues(ginkoRouteDiagnosticCodeValidator)
    const visibilityCodes = validatorLiteralValues(ginkoVisibilityDiagnosticCodeValidator)

    for (const code of routeCodes) {
      expect(visibilityCodes).toContain(code)
    }
  })

  it('uses real JSON validators instead of an any-shaped boundary', () => {
    function collectKinds(validator: unknown, kinds = new Set<string>()): Set<string> {
      if (!validator || typeof validator !== 'object') return kinds
      const record = validatorShape(validator)
      if (typeof record.kind === 'string') kinds.add(record.kind)
      for (const child of record.members ?? []) collectKinds(child, kinds)
      if (record.element) collectKinds(record.element, kinds)
      if (record.value && typeof record.value === 'object') collectKinds(record.value, kinds)
      return kinds
    }

    const valueKinds = collectKinds(jsonValueValidator)
    expect(Array.from(valueKinds)).toEqual(
      expect.arrayContaining(['null', 'boolean', 'float64', 'string', 'array', 'record']),
    )
    expect(valueKinds).not.toContain('any')
    expect(validatorShape(jsonObjectValidator).kind).toBe('record')
    expect(collectKinds(validatorShape(jsonObjectValidator).value)).not.toContain('any')
  })

  it('exports stable publish impact and singleton failure result contracts', () => {
    const publishFields = validatorFields(ginkoPublishImpactResultValidator)
    expect(Object.keys(publishFields).sort()).toEqual([
      'blockingDiagnostics',
      'cacheTags',
      'changes',
      'collection',
      'entryId',
      'events',
      'locales',
      'mode',
      'status',
      'warnings',
    ])
    expect(validatorLiteralValues(publishFields.status)).toEqual([
      'ready',
      'blocked',
      'no_changes',
      'not_publishable',
    ])
    expect(validatorLiteralValues(publishFields.mode)).toEqual(['route', 'none'])

    const singletonFields = validatorFields(ginkoSingletonResultValidator)
    expect(Object.keys(singletonFields).sort()).toEqual(['failure', 'locale', 'name', 'singleton'])
    expect(validatorLiteralValues(singletonFields.failure)).toEqual([
      'missing_locale',
      'unknown_collection',
      'not_singleton',
      'mode_mismatch',
      'no_published_entry',
    ])
  })
})
