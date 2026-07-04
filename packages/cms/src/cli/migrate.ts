import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { createJiti } from 'jiti'

import { type CliIo, type ConvexClientFactory, hasFlag, stableJson, usage, write } from './args.js'
import { deployKey, publicConvexUrl } from './env.js'

type ContentMigrationLocale = {
  values: Record<string, unknown>
  bodyMdc?: string | null
} | null

type ContentMigrationEntry = {
  collection: string
  entryId: string
  stableId: string | null
  draftVersion: number
  shared: Record<string, unknown>
  locales: Record<string, ContentMigrationLocale>
}

type ContentMigration = {
  id: string
  collections: string[]
  up(entry: ContentMigrationEntry): ContentMigrationEntry | Promise<ContentMigrationEntry>
}

type ContentMigrationEntryPage = {
  page: ContentMigrationEntry[]
  isDone: boolean
  continueCursor: string | null
}

type PlannedChange = {
  before: ContentMigrationEntry
  after: ContentMigrationEntry
  paths: string[]
}

type PlannedError = {
  collection: string
  entryId: string
  message: string
}

type MigrationPlan = {
  migration: ContentMigration
  scanned: number
  unchanged: number
  changes: PlannedChange[]
  errors: PlannedError[]
}

function migrationSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function migrationDate() {
  return new Date().toISOString().slice(0, 10)
}

function migrationTemplate(id: string) {
  return `type ContentMigrationEntry = {
  collection: string
  entryId: string
  stableId: string | null
  draftVersion: number
  shared: Record<string, unknown>
  locales: Record<string, { values: Record<string, unknown>; bodyMdc?: string | null } | null>
}

export default {
  id: '${id}',
  collections: [],

  async up(entry: ContentMigrationEntry): Promise<ContentMigrationEntry> {
    return entry
  },
}
`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function cloneEntry(entry: ContentMigrationEntry): ContentMigrationEntry {
  return JSON.parse(JSON.stringify(entry)) as ContentMigrationEntry
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function assertContentMigrationEntry(
  value: unknown,
  context: string,
): asserts value is ContentMigrationEntry {
  if (!isRecord(value)) throw new TypeError(`${context} must return an entry object.`)
  if (typeof value.collection !== 'string')
    throw new TypeError(`${context} returned invalid collection.`)
  if (typeof value.entryId !== 'string') throw new TypeError(`${context} returned invalid entryId.`)
  if (typeof value.draftVersion !== 'number') {
    throw new TypeError(`${context} returned invalid draftVersion.`)
  }
  if (value.stableId !== null && typeof value.stableId !== 'string') {
    throw new TypeError(`${context} returned invalid stableId.`)
  }
  if (!isRecord(value.shared)) throw new TypeError(`${context} returned invalid shared values.`)
  if (!isRecord(value.locales)) throw new TypeError(`${context} returned invalid locales.`)

  for (const [locale, snapshot] of Object.entries(value.locales)) {
    if (snapshot === null) continue
    if (!isRecord(snapshot)) {
      throw new TypeError(`${context} returned invalid locale snapshot for "${locale}".`)
    }
    if (!isRecord(snapshot.values)) {
      throw new TypeError(`${context} returned invalid locale values for "${locale}".`)
    }
    if (
      snapshot.bodyMdc !== undefined &&
      snapshot.bodyMdc !== null &&
      typeof snapshot.bodyMdc !== 'string'
    ) {
      throw new TypeError(`${context} returned invalid bodyMdc for "${locale}".`)
    }
  }
}

function assertMigrationOutput(
  before: ContentMigrationEntry,
  after: unknown,
): ContentMigrationEntry {
  assertContentMigrationEntry(after, `Migration ${before.collection}/${before.entryId}`)

  const immutableKeys = ['collection', 'entryId', 'stableId', 'draftVersion'] as const
  for (const key of immutableKeys) {
    if (after[key] !== before[key]) {
      throw new Error(`Migration cannot change ${key} for ${before.collection}/${before.entryId}.`)
    }
  }

  const beforeLocales = sortedUnique(Object.keys(before.locales))
  const afterLocales = sortedUnique(Object.keys(after.locales))
  if (stableJson(beforeLocales) !== stableJson(afterLocales)) {
    throw new Error(
      `Migration cannot add or remove locale keys for ${before.collection}/${before.entryId}.`,
    )
  }

  for (const locale of beforeLocales) {
    if (before.locales[locale] !== null && after.locales[locale] === null) {
      throw new Error(
        `Migration cannot delete locale "${locale}" for ${before.collection}/${before.entryId}.`,
      )
    }
  }

  return after
}

async function loadContentMigration(cwd: string, fileArg: string): Promise<ContentMigration> {
  const file = resolve(cwd, fileArg)
  if (!existsSync(file)) throw new Error(`Content migration file does not exist: ${file}`)

  const importer = createJiti(import.meta.url, { interopDefault: true })
  const loaded = await importer.import(file)
  const migration = ((loaded as { default?: unknown }).default ??
    loaded) as Partial<ContentMigration>

  if (!isRecord(migration)) throw new TypeError(`Content migration must export an object: ${file}`)
  if (typeof migration.id !== 'string' || migration.id.trim() === '') {
    throw new TypeError(`Content migration must define a non-empty id: ${file}`)
  }
  if (!Array.isArray(migration.collections)) {
    throw new TypeError(`Content migration "${migration.id}" must define collections.`)
  }
  const collections = sortedUnique(
    migration.collections.filter(
      (collection): collection is string => typeof collection === 'string',
    ),
  )
  if (collections.length === 0) {
    throw new Error(`Content migration "${migration.id}" must list at least one collection.`)
  }
  if (typeof migration.up !== 'function') {
    throw new TypeError(`Content migration "${migration.id}" must define an up(entry) function.`)
  }

  return {
    id: migration.id,
    collections,
    up: migration.up,
  }
}

function createMigrationClient(cwd: string, convexClientFactory: ConvexClientFactory) {
  const client = convexClientFactory(publicConvexUrl(cwd))
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms migrate requires a Convex client with admin auth support.')
  }
  client.setAdminAuth(deployKey(cwd))

  return {
    client,
  }
}

async function fetchCollectionEntries(
  client: ReturnType<typeof createMigrationClient>['client'],
  collection: string,
): Promise<ContentMigrationEntry[]> {
  const entries: ContentMigrationEntry[] = []
  let cursor: string | null = null

  do {
    const args = { collection, cursor, limit: 100 }
    const result = (await client.query(
      anyApi.ginkoCms.migrations.listContentMigrationEntriesInternal,
      args,
    )) as ContentMigrationEntryPage
    entries.push(...result.page)
    cursor = result.continueCursor
    if (result.isDone) break
  } while (cursor !== null)

  return entries
}

async function buildMigrationPlan(
  migration: ContentMigration,
  client: ReturnType<typeof createMigrationClient>['client'],
): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    migration,
    scanned: 0,
    unchanged: 0,
    changes: [],
    errors: [],
  }

  for (const collection of migration.collections) {
    const entries = await fetchCollectionEntries(client, collection)
    for (const before of entries) {
      plan.scanned += 1
      try {
        const after = assertMigrationOutput(before, await migration.up(cloneEntry(before)))
        if (stableJson(before) === stableJson(after)) {
          plan.unchanged += 1
          continue
        }
        plan.changes.push({
          before,
          after,
          paths: changedValuePaths(before, after),
        })
      } catch (error) {
        plan.errors.push({
          collection: before.collection,
          entryId: before.entryId,
          message: errorMessage(error),
        })
      }
    }
  }

  return plan
}

function diffRecordPaths(
  prefix: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  paths: string[],
) {
  const keys = sortedUnique([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const beforeValue = before[key]
    const afterValue = after[key]
    const path = `${prefix}.${key}`
    if (stableJson(beforeValue) === stableJson(afterValue)) continue
    if (isRecord(beforeValue) && isRecord(afterValue)) {
      diffRecordPaths(path, beforeValue, afterValue, paths)
    } else {
      paths.push(path)
    }
  }
}

function changedValuePaths(before: ContentMigrationEntry, after: ContentMigrationEntry) {
  const paths: string[] = []
  diffRecordPaths('shared', before.shared, after.shared, paths)

  for (const locale of sortedUnique([
    ...Object.keys(before.locales),
    ...Object.keys(after.locales),
  ])) {
    const beforeLocale = before.locales[locale]
    const afterLocale = after.locales[locale]
    if (beforeLocale === null && afterLocale === null) continue
    if (beforeLocale === null || afterLocale === null) {
      paths.push(`locales.${locale}`)
      continue
    }
    diffRecordPaths(`locales.${locale}.values`, beforeLocale.values, afterLocale.values, paths)
    if ((beforeLocale.bodyMdc ?? null) !== (afterLocale.bodyMdc ?? null)) {
      paths.push(`locales.${locale}.bodyMdc`)
    }
  }

  return paths
}

function formatMigrationPlan(plan: MigrationPlan) {
  const lines = [
    `Content migration plan: ${plan.migration.id}`,
    `  collections: ${plan.migration.collections.join(', ')}`,
    `  entries scanned: ${plan.scanned}`,
    `  changed: ${plan.changes.length}`,
    `  unchanged: ${plan.unchanged}`,
    `  errors: ${plan.errors.length}`,
  ]

  if (plan.changes.length > 0) {
    lines.push('', 'Sample changes:')
    for (const change of plan.changes.slice(0, 5)) {
      const paths = change.paths.slice(0, 8).join(', ') || 'entry changed'
      lines.push(`  - ${change.after.collection}/${change.after.entryId}: ${paths}`)
    }
  }

  if (plan.errors.length > 0) {
    lines.push('', 'Errors:')
    for (const error of plan.errors.slice(0, 10)) {
      lines.push(`  - ${error.collection}/${error.entryId}: ${error.message}`)
    }
    if (plan.errors.length > 10) {
      lines.push(`  - ${plan.errors.length - 10} more error(s) omitted`)
    }
  }

  return `${lines.join('\n')}\n`
}

async function applyMigrationPlan(
  plan: MigrationPlan,
  client: ReturnType<typeof createMigrationClient>['client'],
) {
  let changed = 0
  let unchanged = 0

  for (let index = 0; index < plan.changes.length; index += 50) {
    const entries = plan.changes.slice(index, index + 50).map((change) => change.after)
    const args = { migrationId: plan.migration.id, entries }
    const result = (await client.mutation(
      anyApi.ginkoCms.migrations.applyContentMigrationEntriesInternal,
      args,
    )) as { changed: number; unchanged: number }
    changed += result.changed
    unchanged += result.unchanged
  }

  return { changed, unchanged }
}

export async function runMigrateCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const subcommand = args[1]
  const migrationsDir = join(cwd, 'ginko', 'migrations')

  if (!subcommand || ['--help', '-h'].includes(subcommand)) {
    write(io.stdout, usage())
    return 0
  }

  if (subcommand === 'create') {
    const name = args.slice(2).join(' ')
    if (!name) throw new Error('ginko-cms migrate create requires a change name.')
    const slug = migrationSlug(name)
    if (!slug) throw new Error('ginko-cms migrate create requires a descriptive change name.')
    const id = `${migrationDate()}-${slug}`
    const file = join(migrationsDir, `${id}.ts`)
    if (existsSync(file)) throw new Error(`Migration already exists: ${file}`)

    mkdirSync(migrationsDir, { recursive: true })
    writeFileSync(file, migrationTemplate(id), 'utf8')
    write(io.stdout, `Created content migration scaffold: ${file}\n`)
    write(
      io.stdout,
      'Next: edit the transform, run `pnpm exec ginko-cms migrate plan <file>`, then apply with `--yes`.\n',
    )
    return 0
  }

  if (subcommand === 'list') {
    if (!existsSync(migrationsDir)) {
      write(io.stdout, 'No content migrations found.\n')
      return 0
    }
    const migrations = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.mjs'))
      .sort((left, right) => left.localeCompare(right))
    if (migrations.length === 0) {
      write(io.stdout, 'No content migrations found.\n')
      return 0
    }
    for (const migration of migrations) write(io.stdout, `${migration}\n`)
    return 0
  }

  if (subcommand === 'plan' || subcommand === 'apply') {
    const fileArg = args[2]
    if (!fileArg) throw new Error(`ginko-cms migrate ${subcommand} requires a migration file.`)
    if (subcommand === 'apply' && !hasFlag(args, '--yes')) {
      throw new Error('ginko-cms migrate apply requires --yes.')
    }

    const migration = await loadContentMigration(cwd, fileArg)
    const { client } = createMigrationClient(cwd, convexClientFactory)
    const plan = await buildMigrationPlan(migration, client)
    write(io.stdout, formatMigrationPlan(plan))

    if (plan.errors.length > 0) {
      write(io.stderr, 'Content migration has errors; nothing was applied.\n')
      return 1
    }
    if (subcommand === 'plan') return 0
    if (plan.changes.length === 0) {
      write(io.stdout, `No content changes to apply for migration ${migration.id}.\n`)
      return 0
    }

    const result = await applyMigrationPlan(plan, client)
    write(
      io.stdout,
      `Applied content migration ${migration.id}: changed=${result.changed}, unchanged=${result.unchanged}.\n`,
    )
    write(
      io.stdout,
      'Next: run `pnpm exec ginko-cms push --check`; push only after the check reports safe drift.\n',
    )
    return 0
  }

  throw new Error(
    'Unknown migrate command. Available commands: `ginko-cms migrate create <name>`, `ginko-cms migrate list`, `ginko-cms migrate plan <file>`, `ginko-cms migrate apply <file> --yes`.',
  )
}
