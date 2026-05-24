import type {
  CmsField,
  CollectionRouting,
  JsonValue,
  LocaleText,
} from '@lupinum/ginko-cms-contract/shared/types.js'

import { isEqualJsonValue } from '../lib/data.js'

export type CollectionContractSnapshot = {
  slug: string
  label: LocaleText
  icon: string | null
  type: 'flat' | 'tree'
  routing: Required<CollectionRouting>
  locales: string[]
  fields: CmsField[]
  settings: JsonValue
  contract?: {
    source: 'code'
    version: string
  }
}

export type CollectionContractDriftChange =
  | {
      kind: 'collection_missing'
      safe: true
      reason: string
    }
  | {
      kind: 'label_changed'
      safe: true
    }
  | {
      kind: 'icon_changed'
      safe: true
    }
  | {
      kind: 'settings_changed'
      safe: true
    }
  | {
      kind: 'schema_changed'
      safe: boolean
    }
  | {
      kind: 'contract_snapshot_changed'
      safe: true
    }
  | {
      kind: 'type_changed'
      safe: boolean
      from: 'flat' | 'tree'
      to: 'flat' | 'tree'
    }
  | {
      kind: 'routing_changed'
      safe: boolean
    }
  | {
      kind: 'locales_changed'
      safe: boolean
      added: string[]
      removed: string[]
    }
  | {
      kind: 'field_added'
      safe: boolean
      field: string
      required: boolean
    }
  | {
      kind: 'field_removed'
      safe: boolean
      field: string
    }
  | {
      kind: 'field_changed'
      safe: boolean
      field: string
    }

export type CollectionContractDrift = {
  slug: string
  entryCount: number
  migrationRequired: boolean
  safeToPush: boolean
  changes: CollectionContractDriftChange[]
}

function sortedDiff(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value)).sort((a, b) => a.localeCompare(b))
}

function fieldsByKey(fields: CmsField[]) {
  return new Map(fields.map((field) => [field.key, field]))
}

export function contractChangeCategories(changes: CollectionContractDriftChange[]): string[] {
  const categories = new Set<string>()

  for (const change of changes) {
    if (change.safe) continue
    if (change.kind === 'type_changed') categories.add('type')
    if (change.kind === 'routing_changed') categories.add('routing')
    if (change.kind === 'locales_changed') categories.add('locales')
    if (change.kind === 'schema_changed') categories.add('schema')
    if (
      change.kind === 'field_added' ||
      change.kind === 'field_removed' ||
      change.kind === 'field_changed'
    ) {
      categories.add('fields')
    }
  }

  return [...categories]
}

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cmsSchemaSetting(settings: JsonValue): JsonValue | null {
  if (!isJsonObject(settings)) return null
  if (!Object.prototype.hasOwnProperty.call(settings, 'cmsSchema')) return null
  return settings.cmsSchema ?? null
}

function settingsWithoutCmsSchema(settings: JsonValue): JsonValue {
  if (!isJsonObject(settings)) return settings
  const rest: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (key !== 'cmsSchema') rest[key] = value
  }
  return rest
}

export function classifyMissingCollectionContract(slug: string): CollectionContractDrift {
  return {
    slug,
    entryCount: 0,
    migrationRequired: false,
    safeToPush: true,
    changes: [
      {
        kind: 'collection_missing',
        safe: true,
        reason: 'Collection is defined in code but is not installed in the CMS yet.',
      },
    ],
  }
}

export function classifyCollectionContractDrift(args: {
  existing: CollectionContractSnapshot
  incoming: CollectionContractSnapshot
  entryCount: number
}): CollectionContractDrift {
  const changes: CollectionContractDriftChange[] = []
  const hasEntries = args.entryCount > 0
  const emptyCollectionSafe = !hasEntries

  if (!isEqualJsonValue(args.existing.label, args.incoming.label)) {
    changes.push({ kind: 'label_changed', safe: true })
  }

  if (args.existing.icon !== args.incoming.icon) {
    changes.push({ kind: 'icon_changed', safe: true })
  }

  if (args.existing.type !== args.incoming.type) {
    changes.push({
      kind: 'type_changed',
      safe: emptyCollectionSafe,
      from: args.existing.type,
      to: args.incoming.type,
    })
  }

  if (!isEqualJsonValue(args.existing.routing, args.incoming.routing)) {
    changes.push({ kind: 'routing_changed', safe: emptyCollectionSafe })
  }

  if (!isEqualJsonValue(args.existing.locales, args.incoming.locales)) {
    const added = sortedDiff(args.incoming.locales, args.existing.locales)
    const removed = sortedDiff(args.existing.locales, args.incoming.locales)
    changes.push({
      kind: 'locales_changed',
      safe: emptyCollectionSafe || removed.length === 0,
      added,
      removed,
    })
  }

  const existingFields = fieldsByKey(args.existing.fields)
  const incomingFields = fieldsByKey(args.incoming.fields)

  for (const field of args.incoming.fields) {
    const existing = existingFields.get(field.key)
    if (!existing) {
      const required = field.required === true
      changes.push({
        kind: 'field_added',
        safe: emptyCollectionSafe || !required,
        field: field.key,
        required,
      })
      continue
    }

    if (!isEqualJsonValue(existing, field)) {
      changes.push({ kind: 'field_changed', safe: emptyCollectionSafe, field: field.key })
    }
  }

  for (const field of args.existing.fields) {
    if (!incomingFields.has(field.key)) {
      changes.push({ kind: 'field_removed', safe: emptyCollectionSafe, field: field.key })
    }
  }

  const schemaChanged = !isEqualJsonValue(
    cmsSchemaSetting(args.existing.settings),
    cmsSchemaSetting(args.incoming.settings),
  )
  if (schemaChanged) {
    changes.push({ kind: 'schema_changed', safe: emptyCollectionSafe })
  }

  if (
    !isEqualJsonValue(
      settingsWithoutCmsSchema(args.existing.settings),
      settingsWithoutCmsSchema(args.incoming.settings),
    )
  ) {
    changes.push({ kind: 'settings_changed', safe: true })
  }

  if (!isEqualJsonValue(args.existing.contract ?? null, args.incoming.contract ?? null)) {
    changes.push({ kind: 'contract_snapshot_changed', safe: true })
  }

  const migrationRequired = changes.some((change) => !change.safe)
  return {
    slug: args.incoming.slug,
    entryCount: args.entryCount,
    migrationRequired,
    safeToPush: !migrationRequired,
    changes,
  }
}
