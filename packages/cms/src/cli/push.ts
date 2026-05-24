import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { getCmsComponentForwardingKey } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { createJiti } from 'jiti'

import { entries as collectionBridgeEntries } from '../bridge/collections.js'
import { bridgeEntryFunctionRef } from '../bridge/create.js'
import { resolveConfiguredCollections } from '../module/collections.js'
import { resolveLocaleSettings } from '../module/i18n.js'
import type { ModuleOptions } from '../module/options.js'
import { buildPublicRuntimeCollections } from '../module/runtime-config.js'
import { type CliIo, type ConvexClientFactory, stableJson, write } from './args.js'
import { deployKey, publicConvexUrl, readLocalEnv } from './env.js'
import { withDeployKeyForwarding } from './forwarding.js'

type RuntimeCollection = ReturnType<typeof buildPublicRuntimeCollections>[string]

type PushArgs = {
  check: boolean
}

type CollectionBridgeFunctionRefs = {
  [Entry in (typeof collectionBridgeEntries)[number] as Entry['exportName']]: string
}

type CheckDriftChange = Record<string, unknown> & {
  kind?: string
  safe?: boolean
}

type CheckDriftEntry = {
  slug: string
  reason: 'missing' | 'different'
  entryCount?: number
  entryCountExact?: boolean
  migrationRequired?: boolean
  safeToPush?: boolean
  changes?: CheckDriftChange[]
}

type MissingFromConfigDetail = {
  slug: string
  entryCount?: number
  entryCountExact?: boolean
  migrationRequired?: boolean
  safeToPush?: boolean
}

type CheckCollectionContractsResult = {
  drift: CheckDriftEntry[]
  missingFromConfig: string[]
  missingFromConfigDetails?: MissingFromConfigDetail[]
}

const collectionBridgeFunctionRefs = Object.fromEntries(
  collectionBridgeEntries.map((entry) => [entry.exportName, bridgeEntryFunctionRef(entry)]),
) as CollectionBridgeFunctionRefs

function parsePushArgs(args: string[]): PushArgs {
  return {
    check: args.includes('--check'),
  }
}

async function loadNuxtGinkoOptions(cwd: string): Promise<ModuleOptions> {
  const configPath = resolve(cwd, 'nuxt.config.ts')
  const importer = createJiti(import.meta.url, { interopDefault: true })
  const globalWithNuxtConfig = globalThis as typeof globalThis & {
    defineNuxtConfig?: (config: unknown) => unknown
  }
  const previousDefineNuxtConfig = globalWithNuxtConfig.defineNuxtConfig
  globalWithNuxtConfig.defineNuxtConfig ??= (config: unknown) => config
  let loaded: unknown
  try {
    loaded = existsSync(configPath) ? await importer.import(configPath) : {}
  } finally {
    if (previousDefineNuxtConfig === undefined) {
      delete globalWithNuxtConfig.defineNuxtConfig
    } else {
      globalWithNuxtConfig.defineNuxtConfig = previousDefineNuxtConfig
    }
  }
  const config = ((loaded as { default?: unknown }).default ?? loaded) as {
    ginkoCms?: Partial<ModuleOptions> | false
    content?: {
      i18n?: {
        defaultLocale?: string
        locales?: string[]
        fallback?: Record<string, string[]>
        translatedSlugs?: boolean
      }
    }
    i18n?: {
      defaultLocale?: string
      locales?: Array<{ code: string; label?: string; name?: string }>
    }
  }
  if (config.ginkoCms === false) {
    throw new Error('ginko-cms is disabled in nuxt.config; no collection contracts can be pushed.')
  }
  const userOptions = config.ginkoCms && typeof config.ginkoCms === 'object' ? config.ginkoCms : {}
  const options: ModuleOptions = {
    route: userOptions.route ?? '/studio',
    debugStudio: userOptions.debugStudio,
    collectionsDir: userOptions.collectionsDir,
    content: userOptions.content,
    contentTranslatedSlugs: config.content?.i18n?.translatedSlugs === true,
    collections: userOptions.collections ?? {},
    defaultLocale:
      userOptions.defaultLocale ??
      config.content?.i18n?.defaultLocale ??
      config.i18n?.defaultLocale ??
      'en',
    locales:
      userOptions.locales ??
      config.content?.i18n?.locales?.map((code) => ({
        code,
        isDefault: code === (config.content?.i18n?.defaultLocale ?? userOptions.defaultLocale),
        fallback: config.content?.i18n?.fallback?.[code]?.[0],
      })) ??
      config.i18n?.locales?.map((locale) => ({
        code: locale.code,
        label: locale.label ?? locale.name,
        isDefault: locale.code === (config.i18n?.defaultLocale ?? userOptions.defaultLocale),
      })) ??
      [],
    search: userOptions.search ?? { enabled: false },
    siteData: userOptions.siteData ?? { enabled: false },
    publicContent: userOptions.publicContent ?? {
      api: false,
      sitemap: false,
      prerender: false,
      prerenderFailure: 'error',
    },
    forms: userOptions.forms ?? { enabled: false },
    siteI18n: userOptions.siteI18n,
    sidebar: userOptions.sidebar,
    mcp: userOptions.mcp ?? false,
  }
  const localeSettings = resolveLocaleSettings(options)
  options.collections = await resolveConfiguredCollections({
    rootDir: cwd,
    moduleOptions: options,
    defaultLocale: localeSettings.defaultLocale,
    locales: localeSettings.locales,
  })
  return options
}

function collectionPayload(collections: Record<string, RuntimeCollection>) {
  return Object.entries(collections).map(([slug, collection]) => ({
    slug,
    label: collection.label,
    ...(collection.icon !== undefined ? { icon: collection.icon } : {}),
    type: collection.type,
    routing: {
      mode: collection.routing.mode ?? 'route',
      pathPrefix: collection.routing.pathPrefix,
      slugMode: collection.routing.slugMode ?? 'shared',
      rootSlug: collection.routing.rootSlug ?? null,
      singleton: collection.routing.singleton ?? false,
    },
    locales: collection.locales,
    fields: collection.fields ?? [],
    settings: collection.settings ?? {},
  }))
}

function formatEntryCount(entryCount: number | undefined, exact = true) {
  if (entryCount === undefined) return 'unknown'
  if (!exact) return `${entryCount}+`
  return String(entryCount)
}

function formatYesNo(value: boolean | undefined) {
  if (value === undefined) return 'unknown'
  return value ? 'yes' : 'no'
}

function formatStringList(values: unknown) {
  if (!Array.isArray(values) || values.length === 0) return 'none'
  return values.map((value) => String(value)).join(', ')
}

function formatDriftChange(change: CheckDriftChange) {
  switch (change.kind) {
    case 'collection_missing':
      return 'collection is not installed yet'
    case 'label_changed':
      return 'collection label changed'
    case 'icon_changed':
      return 'collection icon changed'
    case 'settings_changed':
      return 'collection settings changed'
    case 'schema_changed':
      return 'collection schema changed'
    case 'contract_snapshot_changed':
      return 'contract snapshot changed'
    case 'type_changed':
      return `type changed: ${String(change.from)} -> ${String(change.to)}`
    case 'routing_changed':
      return 'routing changed'
    case 'locales_changed':
      return `locales changed: added [${formatStringList(change.added)}], removed [${formatStringList(change.removed)}]`
    case 'field_added':
      return `field added: ${String(change.field)}${change.required ? ' (required)' : ' (optional)'}`
    case 'field_removed':
      return `field removed: ${String(change.field)}`
    case 'field_changed':
      return `field changed: ${String(change.field)}`
    default:
      return change.kind ? String(change.kind) : JSON.stringify(change)
  }
}

function formatDriftReport(result: CheckCollectionContractsResult) {
  const lines = ['Collection contract drift detected.', '']

  for (const entry of result.drift) {
    lines.push(`${entry.slug}:`)
    lines.push(`  status: ${entry.reason}`)
    lines.push(`  affected entries: ${formatEntryCount(entry.entryCount, entry.entryCountExact)}`)
    lines.push(`  migration required: ${formatYesNo(entry.migrationRequired)}`)
    if (entry.changes && entry.changes.length > 0) {
      lines.push('  changes:')
      for (const change of entry.changes) {
        const safety = change.safe === false ? 'migration required' : 'safe to push'
        lines.push(`    - ${formatDriftChange(change)} (${safety})`)
      }
    }
    lines.push('')
  }

  const missingDetails =
    result.missingFromConfigDetails ??
    result.missingFromConfig.map((slug) => ({
      slug,
      entryCount: undefined,
      migrationRequired: undefined,
      safeToPush: undefined,
    }))

  if (missingDetails.length > 0) {
    lines.push('Collections missing from content.config.ts:')
    for (const detail of missingDetails) {
      lines.push(
        `  - ${detail.slug}: affected entries=${formatEntryCount(detail.entryCount, detail.entryCountExact)}, migration required=${formatYesNo(detail.migrationRequired)}`,
      )
    }
    lines.push('')
  }

  const hasUnknownMigrationState =
    result.drift.some((entry) => entry.migrationRequired === undefined) ||
    missingDetails.some((entry) => entry.migrationRequired === undefined)

  const requiresMigration =
    result.drift.some((entry) => entry.migrationRequired !== false) ||
    missingDetails.some((entry) => entry.migrationRequired !== false)
  if (requiresMigration) {
    lines.push('Recommended next steps:')
    if (hasUnknownMigrationState) {
      lines.push('  1. Regenerate/deploy the CMS bridge for precise drift details.')
      lines.push('  2. Treat this drift as migration-required until the check says otherwise.')
      lines.push('  3. Create or choose an explicit content migration.')
      lines.push('  4. Run a backup before applying changes.')
      lines.push('  5. Apply the content migration, then run `pnpm exec ginko-cms push`.')
    } else {
      lines.push('  1. Create or choose an explicit content migration.')
      lines.push('  2. Run a backup before applying changes.')
      lines.push('  3. Apply the content migration, then run `pnpm exec ginko-cms push`.')
    }
    lines.push('')
    lines.push('Starter command:')
    lines.push('  pnpm exec ginko-cms migrate create <change-name>')
  } else {
    lines.push('Recommended next step:')
    lines.push('  pnpm exec ginko-cms push')
  }

  lines.push('')
  lines.push('Docs: docs/changing-collections.md')

  return `${lines.join('\n')}\n`
}

export async function runPushCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const push = parsePushArgs(args.slice(1))
  const options = await loadNuxtGinkoOptions(cwd)
  const localeSettings = resolveLocaleSettings(options)
  const payload = collectionPayload(buildPublicRuntimeCollections(options, localeSettings))
  const client = convexClientFactory(publicConvexUrl(cwd))
  const adminKey = deployKey(cwd)
  const env = {
    ...readLocalEnv(cwd),
    ...process.env,
  }
  const identityForwardingKey = getCmsComponentForwardingKey({
    CONVEX_IDENTITY_FORWARDING_KEY: env.CONVEX_IDENTITY_FORWARDING_KEY,
    GINKO_CMS_COMPONENT_FORWARDING_KEY: env.GINKO_CMS_COMPONENT_FORWARDING_KEY,
    VITEST: env.VITEST,
  })
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms push requires a Convex client with admin auth support.')
  }
  client.setAdminAuth(adminKey)

  if (push.check) {
    const result = (await client.query(
      anyApi.ginkoCms.collections.checkCollectionContracts,
      withDeployKeyForwarding(
        {
          collections: payload,
        },
        {
          functionRef: collectionBridgeFunctionRefs.checkCollectionContracts,
          purpose: 'query',
          identityForwardingKey,
          envelopeArgs: {},
        },
      ),
    )) as CheckCollectionContractsResult
    if (result.drift.length > 0 || result.missingFromConfig.length > 0) {
      write(io.stderr, formatDriftReport(result))
      return 1
    }
    write(
      io.stdout,
      `Ginko CMS collection contracts are installed for ${payload.length} collection(s).\n`,
    )
    return 0
  }

  const result = (await client.mutation(
    anyApi.ginkoCms.collections.installCollectionContracts,
    withDeployKeyForwarding(
      {
        collections: payload,
      },
      {
        functionRef: collectionBridgeFunctionRefs.installCollectionContracts,
        purpose: 'mutation',
        identityForwardingKey,
        envelopeArgs: {},
      },
    ),
  )) as { created: number; updated: number; skipped: number; missingFromConfig: string[] }
  write(
    io.stdout,
    `Ginko CMS collection contracts pushed: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, missingFromConfig=[${result.missingFromConfig.join(', ')}].\n`,
  )
  write(io.stdout, `Contract fingerprint: ${stableJson(payload).length}:${payload.length}\n`)
  return 0
}
