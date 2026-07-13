import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

import {
  buildCmsImportGraph,
  parseCmsImportFile,
  type CmsImportContentContext,
} from '@lupinum/ginko-content/cms-import'

import type { CollectionConfig, FieldConfig } from '../module/options.js'

type JsonRecord = Record<string, unknown>

export type FilesystemMigrationEntry = {
  collection: string
  stableId: string
  parentStableId?: string | null
  locale: string
  sourcePath: string
  routePath: string
  slug: string
  orderRank?: string | null
  shared: JsonRecord
  localized: JsonRecord
  body?: string
  bodyMdc?: string
  seo?: JsonRecord
  public?: {
    sitemap?: boolean
    search?: boolean
    navigation?: boolean
  }
  relationReferences: Array<{
    field: string
    collection: string
    value: unknown
  }>
}

export type FilesystemMigrationNavigation = {
  collection: string
  locale: string
  sourcePath: string
  path: string
  title?: string
  hidden?: boolean
  order: string[]
}

export type FilesystemMigrationPlan = {
  rootDir: string
  collections: Array<{ slug: string; config: CollectionConfig; sourcePath: string }>
  entries: FilesystemMigrationEntry[]
  navigation: FilesystemMigrationNavigation[]
  assets: Array<{ sourcePath: string; referencedBy: string[] }>
  warnings: Array<{ code: string; message: string; sourcePath?: string }>
}

export type FilesystemMigrationOptions = {
  rootDir: string
  collectionsDir?: string
  contentDir?: string
  defaultLocale?: string
}

export type FilesystemMigrationTarget<ApplyResult = unknown> = {
  previewImport?: (payload: FilesystemMigrationImportPayload) => Promise<unknown>
  applyImport?: (payload: FilesystemMigrationImportPayload) => Promise<ApplyResult>
}

export type FilesystemMigrationImportPayload = {
  source: {
    provider: 'filesystem'
    root: string
  }
  collections: Array<{ slug: string } & CollectionConfig>
  entries: FilesystemMigrationEntry[]
  assets: FilesystemMigrationPlan['assets']
}

export type FilesystemMigrationAssetReplacement = {
  sourcePath: string
  replacement: string
}

export type FilesystemMigrationAssetUploader = (
  asset: FilesystemMigrationPlan['assets'][number],
) => Promise<string | null | undefined>

export type FilesystemMigrationAssetUploadResult = {
  plan: FilesystemMigrationPlan
  replacements: FilesystemMigrationAssetReplacement[]
  uploaded: number
  skipped: number
}

const markdownExtensions = new Set(['.md', '.mdc', '.markdown'])
const dataExtensions = new Set(['.json', '.yml', '.yaml'])
const navigationFilenames = new Set([
  '_navigation.yml',
  '_navigation.yaml',
  '.navigation.yml',
  '.navigation.yaml',
])
const reservedFrontmatterKeys = new Set([
  'stableId',
  'parentStableId',
  'translationKey',
  'locale',
  'title',
  'description',
  'body',
  'bodyMdc',
  'seo',
  'sitemap',
  'search',
  'navigation',
])
const MAX_MIGRATION_FILES = 10_000
const MAX_MIGRATION_BYTES = 50 * 1024 * 1024
const MAX_MIGRATION_DEPTH = 32

type MigrationTraversalBudget = {
  files: number
  bytes: number
  directories: Set<string>
}

export async function createFilesystemMigrationPlan(
  options: FilesystemMigrationOptions,
): Promise<FilesystemMigrationPlan> {
  const rootDir = resolve(options.rootDir)
  const collectionsDir = resolve(rootDir, options.collectionsDir ?? 'collections')
  const contentDir = resolve(rootDir, options.contentDir ?? 'content')
  const defaultLocale = options.defaultLocale ?? 'en'
  const warnings: FilesystemMigrationPlan['warnings'] = []
  const traversal = { files: 0, bytes: 0, directories: new Set<string>() }
  const collections = readCollections(collectionsDir, warnings, traversal)
  const collectionBySlug = new Map(collections.map((collection) => [collection.slug, collection]))
  const contentFiles = existsSync(contentDir) ? walk(contentDir, traversal) : []
  const importContext = createCmsImportContext({ collections, defaultLocale })
  const navigation = existsSync(contentDir)
    ? await readNavigationDocuments({
        rootDir,
        contentDir,
        files: contentFiles,
        defaultLocale,
        collectionBySlug,
        importContext,
        warnings,
      })
    : []
  const rawEntries = existsSync(contentDir)
    ? await readContentEntries({
        rootDir,
        contentDir,
        files: contentFiles,
        defaultLocale,
        collectionBySlug,
        importContext,
        navigation,
        warnings,
      })
    : []
  const entries = resolveRelationReferences({
    entries: rawEntries,
    fieldsByCollection: new Map(
      collections.map((collection) => [collection.slug, collection.config.fields ?? []]),
    ),
    warnings,
  })
  addAssetWarnings({ rootDir, assets: collectAssetReferences(entries), warnings })

  if (!existsSync(contentDir)) {
    warnings.push({
      code: 'content_dir_missing',
      message: `Content directory does not exist: ${relative(rootDir, contentDir)}`,
    })
  }

  return {
    rootDir,
    collections,
    entries,
    navigation,
    assets: collectAssetReferences(entries),
    warnings,
  }
}

export async function previewFilesystemMigration(
  plan: FilesystemMigrationPlan,
  target: FilesystemMigrationTarget,
) {
  return await target.previewImport?.(createFilesystemImportPayload(plan))
}

export async function applyFilesystemMigration<ApplyResult = unknown>(
  plan: FilesystemMigrationPlan,
  target: FilesystemMigrationTarget<ApplyResult>,
): Promise<ApplyResult> {
  if (!target.applyImport) {
    throw new Error('applyFilesystemMigration requires an applyImport target.')
  }
  return await target.applyImport(createFilesystemImportPayload(plan))
}

export function createFilesystemImportPayload(
  plan: FilesystemMigrationPlan,
): FilesystemMigrationImportPayload {
  return {
    source: {
      provider: 'filesystem',
      root: plan.rootDir,
    },
    collections: plan.collections.map(toCollectionImport),
    entries: plan.entries,
    assets: plan.assets,
  }
}

export function rewriteFilesystemMigrationAssetReferences(
  plan: FilesystemMigrationPlan,
  replacements: FilesystemMigrationAssetReplacement[],
): FilesystemMigrationPlan {
  const replacementMap = new Map(
    replacements
      .filter((item) => item.sourcePath && item.replacement)
      .map((item) => [item.sourcePath, item.replacement]),
  )
  if (replacementMap.size === 0) return plan

  return {
    ...plan,
    entries: plan.entries.map((entry) => ({
      ...entry,
      shared: rewriteAssetReferencesInValue(entry.shared, replacementMap) as JsonRecord,
      localized: rewriteAssetReferencesInValue(entry.localized, replacementMap) as JsonRecord,
      body: rewriteAssetReferencesInOptionalString(entry.body, replacementMap),
      bodyMdc: rewriteAssetReferencesInOptionalString(entry.bodyMdc, replacementMap),
      seo: entry.seo
        ? (rewriteAssetReferencesInValue(entry.seo, replacementMap) as JsonRecord)
        : undefined,
    })),
    assets: plan.assets.filter((asset) => !replacementMap.has(asset.sourcePath)),
  }
}

export async function uploadFilesystemMigrationAssets(
  plan: FilesystemMigrationPlan,
  uploader: FilesystemMigrationAssetUploader,
): Promise<FilesystemMigrationAssetUploadResult> {
  const replacements: FilesystemMigrationAssetReplacement[] = []

  for (const asset of plan.assets) {
    const replacement = await uploader(asset)
    if (!replacement) continue
    replacements.push({
      sourcePath: asset.sourcePath,
      replacement,
    })
  }

  return {
    plan: rewriteFilesystemMigrationAssetReferences(plan, replacements),
    replacements,
    uploaded: replacements.length,
    skipped: plan.assets.length - replacements.length,
  }
}

function readCollections(
  collectionsDir: string,
  warnings: FilesystemMigrationPlan['warnings'],
  traversal: MigrationTraversalBudget,
): FilesystemMigrationPlan['collections'] {
  if (!existsSync(collectionsDir)) return []
  const files = walk(collectionsDir, traversal)
    .filter((file) => file.endsWith('.json'))
    .sort()
  const collections: FilesystemMigrationPlan['collections'] = []

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as
      | ({ slug?: string } & CollectionConfig)
      | Array<{ slug?: string } & CollectionConfig>
    const items = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of items) {
      const slug = item.slug ?? basename(file, '.json')
      if (slug === 'all') continue
      const { slug: _slug, ...config } = item
      collections.push({ slug, config, sourcePath: file })
    }
  }

  if (!collections.length) {
    warnings.push({
      code: 'collections_missing',
      message: `No collection JSON files found in ${collectionsDir}`,
    })
  }

  return collections
}

function rewriteAssetReferencesInOptionalString(
  value: string | undefined,
  replacements: Map<string, string>,
) {
  if (value === undefined) return undefined
  return rewriteAssetReferenceString(value, replacements)
}

function rewriteAssetReferenceString(value: string, replacements: Map<string, string>) {
  let next = value
  for (const [sourcePath, replacement] of replacements) {
    next = next.split(sourcePath).join(replacement)
  }
  return next
}

function rewriteAssetReferencesInValue(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') return rewriteAssetReferenceString(value, replacements)
  if (Array.isArray(value)) {
    return value.map((item) => rewriteAssetReferencesInValue(item, replacements))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      rewriteAssetReferencesInValue(nested, replacements),
    ]),
  )
}

function createCmsImportContext(args: {
  collections: FilesystemMigrationPlan['collections']
  defaultLocale: string
}): CmsImportContentContext {
  const collections = Object.fromEntries(
    args.collections.map((collection) => [
      collection.slug,
      {
        ...collection.config,
        source: `${collection.slug}/**/*.{md,mdc,markdown,json,yml,yaml}`,
      },
    ]),
  )
  return {
    collections,
    defaultLocale: args.defaultLocale,
    locales: Array.from(
      new Set(args.collections.flatMap((collection) => collection.config.locales ?? [])),
    ),
  } as CmsImportContentContext
}

async function readContentEntries(args: {
  rootDir: string
  contentDir: string
  files: string[]
  defaultLocale: string
  collectionBySlug: Map<string, FilesystemMigrationPlan['collections'][number]>
  importContext: CmsImportContentContext
  navigation: FilesystemMigrationNavigation[]
  warnings: FilesystemMigrationPlan['warnings']
}) {
  const parsedDocuments: Array<Awaited<ReturnType<typeof parseCmsImportFile>>['document']> = []
  const entries = (
    await Promise.all(
      args.files
        .filter((file) => isContentEntryFile(file))
        .map(async (file) => {
          const relativePath = relative(args.contentDir, file)
          const [collectionSlug] = relativePath.split(/[\\/]/)
          const collection = collectionSlug ? args.collectionBySlug.get(collectionSlug) : null
          if (!collectionSlug || !collection) {
            args.warnings.push({
              code: 'unknown_collection_content',
              message: `No collection config found for ${relativePath}`,
              sourcePath: file,
            })
            return []
          }
          const parsed = await parseContentFile({
            file,
            contentDir: args.contentDir,
            importContext: args.importContext,
          })
          if (!parsed) {
            args.warnings.push({
              code: 'unsupported_content_file',
              message: `Unsupported content file: ${relativePath}`,
              sourcePath: file,
            })
            return []
          }
          parsedDocuments.push(parsed.document)
          if (!markdownExtensions.has(extname(file)) && collection.config.routing.mode !== 'none') {
            args.warnings.push({
              code: 'data_file_requires_data_collection',
              message: `Data file ${relativePath} belongs to a route-backed collection. Use Markdown/MDC for route-backed content or set routing.mode to "none".`,
              sourcePath: file,
            })
            return []
          }
          const { frontmatter, body } = parsed
          addFieldMappingWarnings({
            frontmatter,
            fields: collection.config.fields ?? [],
            warnings: args.warnings,
            sourcePath: file,
          })
          const routePath = routePathFromContent(collection.config, relativePath)
          const slug =
            collection.config.routing.mode === 'none'
              ? basename(relativePath, extname(relativePath))
              : (routePath.split('/').filter(Boolean).at(-1) ?? 'index')
          const stableId =
            typeof frontmatter.stableId === 'string'
              ? frontmatter.stableId
              : typeof frontmatter.translationKey === 'string'
                ? frontmatter.translationKey
                : relativePath.replace(extname(relativePath), '').replace(/[\\/]/g, ':')
          const publicFlags = publicFlagsFromFrontmatter(frontmatter)
          const seo = isRecord(frontmatter.seo) ? frontmatter.seo : undefined
          return [
            {
              collection: collectionSlug,
              stableId,
              locale:
                typeof frontmatter.locale === 'string' ? frontmatter.locale : args.defaultLocale,
              sourcePath: file,
              routePath,
              slug,
              shared: sharedFieldsFromFrontmatter(frontmatter, collection.config.fields ?? []),
              localized: {
                title: frontmatter.title,
                description: frontmatter.description,
                ...(body !== undefined ? { body } : {}),
                ...(typeof frontmatter.bodyMdc === 'string'
                  ? { bodyMdc: frontmatter.bodyMdc }
                  : body !== undefined
                    ? { bodyMdc: body }
                    : {}),
                ...localizedFieldsFromFrontmatter(frontmatter, collection.config.fields ?? []),
              },
              ...(body !== undefined ? { body } : {}),
              ...(typeof frontmatter.bodyMdc === 'string'
                ? { bodyMdc: frontmatter.bodyMdc }
                : body !== undefined
                  ? { bodyMdc: body }
                  : {}),
              seo,
              public: publicFlags,
              relationReferences: relationReferencesFromFrontmatter(
                frontmatter,
                collection.config.fields ?? [],
              ),
            },
          ]
        }),
    )
  ).flat()

  addContentGraphWarnings({
    documents: parsedDocuments,
    warnings: args.warnings,
  })

  const stableIdsByRoute = new Map<string, Set<string>>()
  const sourcePathsByStableLocale = new Map<string, Set<string>>()
  for (const entry of entries) {
    const key = `${entry.collection}:${entry.locale}:${entry.routePath}`
    const stableIds = stableIdsByRoute.get(key) ?? new Set<string>()
    stableIds.add(entry.stableId)
    stableIdsByRoute.set(key, stableIds)

    const stableLocaleKey = `${entry.collection}:${entry.stableId}:${entry.locale}`
    const sourcePaths = sourcePathsByStableLocale.get(stableLocaleKey) ?? new Set<string>()
    sourcePaths.add(entry.sourcePath)
    sourcePathsByStableLocale.set(stableLocaleKey, sourcePaths)
  }
  for (const [key, stableIds] of stableIdsByRoute) {
    if (stableIds.size <= 1) continue
    args.warnings.push({
      code: 'route_conflict',
      message: `Route "${key}" resolves to multiple entries: ${Array.from(stableIds).sort().join(', ')}.`,
    })
  }
  for (const [key, sourcePaths] of sourcePathsByStableLocale) {
    if (sourcePaths.size <= 1) continue
    args.warnings.push({
      code: 'locale_conflict',
      message: `Entry locale "${key}" is defined by multiple source files.`,
      sourcePath: Array.from(sourcePaths).sort()[0],
    })
  }

  const stableIdByRoute = new Map(
    entries.map((entry) => [
      `${entry.collection}:${entry.locale}:${entry.routePath}`,
      entry.stableId,
    ]),
  )

  const orderRankByRoute = new Map(
    args.navigation.flatMap((navigation) =>
      navigation.order.map((slug, index) => [
        `${navigation.collection}:${navigation.locale}:${joinRoute(navigation.path, slug)}`,
        orderRankForIndex(index),
      ]),
    ),
  )

  return entries.map((entry) => {
    const parentRoutePath = parentRoutePathFor(entry.routePath)
    const orderRank = orderRankByRoute.get(`${entry.collection}:${entry.locale}:${entry.routePath}`)
    const next = orderRank ? { ...entry, orderRank } : entry
    if (!parentRoutePath) return next
    const parentStableId = stableIdByRoute.get(
      `${entry.collection}:${entry.locale}:${parentRoutePath}`,
    )
    return parentStableId ? { ...next, parentStableId } : next
  })
}

function isContentEntryFile(file: string) {
  const extension = extname(file)
  return (
    markdownExtensions.has(extension) ||
    (dataExtensions.has(extension) && !navigationFilenames.has(basename(file)))
  )
}

function resolveRelationReferences(args: {
  entries: FilesystemMigrationEntry[]
  fieldsByCollection: Map<string, FieldConfig[]>
  warnings: FilesystemMigrationPlan['warnings']
}): FilesystemMigrationEntry[] {
  const lookups = buildRelationLookups(args.entries)
  return args.entries.map((entry) => {
    const fields = args.fieldsByCollection.get(entry.collection) ?? []
    const shared = rewriteRelationValues({
      fields,
      data: entry.shared,
      lookups,
      warnings: args.warnings,
      sourcePath: entry.sourcePath,
    })
    const localized = rewriteRelationValues({
      fields,
      data: entry.localized,
      lookups,
      warnings: args.warnings,
      sourcePath: entry.sourcePath,
    })
    return { ...entry, shared, localized }
  })
}

function buildRelationLookups(entries: FilesystemMigrationEntry[]) {
  const valuesByCollection = new Map<string, Map<string, Set<string>>>()
  const add = (collection: string, key: string | undefined, stableId: string) => {
    if (!key) return
    const trimmed = key.trim()
    if (!trimmed) return
    const byValue = valuesByCollection.get(collection) ?? new Map<string, Set<string>>()
    const matches = byValue.get(trimmed) ?? new Set<string>()
    matches.add(stableId)
    byValue.set(trimmed, matches)
    valuesByCollection.set(collection, byValue)
  }

  for (const entry of entries) {
    add(entry.collection, entry.stableId, entry.stableId)
    add(entry.collection, entry.slug, entry.stableId)
    add(entry.collection, entry.routePath, entry.stableId)
    add(entry.collection, entry.routePath.replace(/^\//, ''), entry.stableId)
  }

  return valuesByCollection
}

function rewriteRelationValues(args: {
  fields: FieldConfig[]
  data: JsonRecord
  lookups: Map<string, Map<string, Set<string>>>
  warnings: FilesystemMigrationPlan['warnings']
  sourcePath: string
}): JsonRecord {
  const next: JsonRecord = { ...args.data }

  for (const field of args.fields) {
    if (!(field.key in next)) continue
    const value = next[field.key]

    if (field.type === 'relation') {
      next[field.key] = resolveRelationValue({
        field,
        value,
        lookups: args.lookups,
        warnings: args.warnings,
        sourcePath: args.sourcePath,
      })
      continue
    }

    if (field.type === 'relations') {
      next[field.key] = resolveRelationsValue({
        field,
        value,
        lookups: args.lookups,
        warnings: args.warnings,
        sourcePath: args.sourcePath,
      })
      continue
    }

    if (field.type === 'object' && isRecord(value)) {
      next[field.key] = rewriteRelationValues({
        fields: field.fields ?? [],
        data: value,
        lookups: args.lookups,
        warnings: args.warnings,
        sourcePath: args.sourcePath,
      })
      continue
    }

    if (field.type === 'array' && Array.isArray(value)) {
      next[field.key] = value.map((item) =>
        isRecord(item)
          ? rewriteRelationValues({
              fields: field.fields ?? [],
              data: item,
              lookups: args.lookups,
              warnings: args.warnings,
              sourcePath: args.sourcePath,
            })
          : item,
      )
      continue
    }

    if (field.type === 'blocks' && Array.isArray(value)) {
      next[field.key] = value.map((item) => {
        if (!isRecord(item)) return item
        const blockType = typeof item.type === 'string' ? item.type : undefined
        const blockField = (field.fields ?? []).find((candidate) => candidate.key === blockType)
        if (!blockField || !isRecord(item.data)) return item
        return {
          ...item,
          data: rewriteRelationValues({
            fields: blockField.fields ?? [],
            data: item.data,
            lookups: args.lookups,
            warnings: args.warnings,
            sourcePath: args.sourcePath,
          }),
        }
      })
    }
  }

  return next
}

function resolveRelationValue(args: {
  field: FieldConfig
  value: unknown
  lookups: Map<string, Map<string, Set<string>>>
  warnings: FilesystemMigrationPlan['warnings']
  sourcePath: string
}): unknown {
  if (typeof args.value !== 'string' || !args.value) return args.value
  const collection = args.field.relation?.collectionId
  if (!collection) return args.value
  const resolved = resolveRelationReference(args.lookups, collection, args.value)
  if (resolved.status === 'resolved') return resolved.stableId
  args.warnings.push({
    code:
      resolved.status === 'ambiguous'
        ? 'ambiguous_relation_reference'
        : 'unresolved_relation_reference',
    message:
      resolved.status === 'ambiguous'
        ? `Relation field "${args.field.key}" value "${args.value}" matches multiple entries in collection "${collection}". Use an explicit stableId.`
        : `Relation field "${args.field.key}" value "${args.value}" could not be resolved in collection "${collection}".`,
    sourcePath: args.sourcePath,
  })
  return args.value
}

function resolveRelationsValue(args: {
  field: FieldConfig
  value: unknown
  lookups: Map<string, Map<string, Set<string>>>
  warnings: FilesystemMigrationPlan['warnings']
  sourcePath: string
}): unknown {
  if (!Array.isArray(args.value)) return args.value
  return args.value.map((item) =>
    resolveRelationValue({
      field: args.field,
      value: item,
      lookups: args.lookups,
      warnings: args.warnings,
      sourcePath: args.sourcePath,
    }),
  )
}

function resolveRelationReference(
  lookups: Map<string, Map<string, Set<string>>>,
  collection: string,
  value: string,
): { status: 'resolved'; stableId: string } | { status: 'ambiguous' | 'missing' } {
  const matches = lookups.get(collection)?.get(value)
  if (!matches?.size) return { status: 'missing' }
  if (matches.size > 1) return { status: 'ambiguous' }
  const stableId = Array.from(matches)[0]
  return stableId ? { status: 'resolved', stableId } : { status: 'missing' }
}

async function readNavigationDocuments(args: {
  rootDir: string
  contentDir: string
  files: string[]
  defaultLocale: string
  collectionBySlug: Map<string, FilesystemMigrationPlan['collections'][number]>
  importContext: CmsImportContentContext
  warnings: FilesystemMigrationPlan['warnings']
}): Promise<FilesystemMigrationNavigation[]> {
  return (
    await Promise.all(
      args.files
        .filter((file) => navigationFilenames.has(basename(file)))
        .map(async (file) => {
          const relativePath = relative(args.contentDir, file)
          const [collectionSlug] = relativePath.split(/[\\/]/)
          const collection = collectionSlug ? args.collectionBySlug.get(collectionSlug) : null
          if (!collectionSlug || !collection) {
            args.warnings.push({
              code: 'unknown_collection_navigation',
              message: `No collection config found for navigation document ${relativePath}`,
              sourcePath: file,
            })
            return []
          }

          const parsedFile = await parseContentFile({
            file,
            contentDir: args.contentDir,
            importContext: args.importContext,
          })
          const parsed = parsedFile?.frontmatter ?? {}
          const directoryPath = relativePath.split(/[\\/]/).slice(1, -1).join('/')
          const path =
            `${collection.config.routing.pathPrefix.replace(/\/$/, '')}/${directoryPath}`.replace(
              /\/+/g,
              '/',
            ) || '/'
          const navigationValue = parsed.navigation
          return [
            {
              collection: collectionSlug,
              locale: typeof parsed.locale === 'string' ? parsed.locale : args.defaultLocale,
              sourcePath: file,
              path,
              title: typeof parsed.title === 'string' ? parsed.title : undefined,
              hidden: navigationValue === false ? true : undefined,
              order: Array.isArray(navigationValue)
                ? navigationValue.filter((item): item is string => typeof item === 'string')
                : [],
            },
          ]
        }),
    )
  ).flat()
}

async function parseContentFile(args: {
  file: string
  contentDir: string
  importContext: CmsImportContentContext
}): Promise<{
  frontmatter: JsonRecord
  body?: string
  document: Awaited<ReturnType<typeof parseCmsImportFile>>['document']
} | null> {
  const source = readFileSync(args.file, 'utf8')
  const extension = extname(args.file)
  if (
    markdownExtensions.has(extension) ||
    extension === '.json' ||
    extension === '.yml' ||
    extension === '.yaml'
  ) {
    const parsed = await parseCmsImportFile({
      id: `content:${relative(args.contentDir, args.file).replaceAll('\\', '/')}`,
      source,
      context: args.importContext,
    })
    return {
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      document: parsed.document,
    }
  }
  return null
}

function addContentGraphWarnings(args: {
  documents: Array<Awaited<ReturnType<typeof parseCmsImportFile>>['document']>
  warnings: FilesystemMigrationPlan['warnings']
}) {
  const graph = buildCmsImportGraph(args.documents)
  const canonicalByLocale = new Map<string, string>()
  for (const document of args.documents) {
    if (!document.canonicalKey || !document.locale) continue
    const key = `${document.canonicalKey}:${document.locale}`
    const existing = canonicalByLocale.get(key)
    if (existing && existing !== document.id) {
      args.warnings.push({
        code: 'duplicate_canonical_key',
        message: `Canonical key "${document.canonicalKey}" has multiple "${document.locale}" variants.`,
        sourcePath: document.file?.path || document.id,
      })
    }
    canonicalByLocale.set(key, document.id)
  }

  const routeOwners = new Map<string, Set<string>>()
  for (const [route, canonicalKey] of Object.entries(graph.byRoute)) {
    const owners = routeOwners.get(route) ?? new Set<string>()
    owners.add(canonicalKey)
    routeOwners.set(route, owners)
  }
  for (const [route, owners] of routeOwners) {
    if (owners.size <= 1) continue
    args.warnings.push({
      code: 'route_conflict',
      message: `Route "${route}" resolves to multiple canonical entries: ${Array.from(owners).sort().join(', ')}.`,
    })
  }
}

function routePathFromContent(collection: CollectionConfig, relativePath: string) {
  if (collection.routing.mode === 'none') return ''
  const prefix = collection.routing.pathPrefix.replace(/\/$/, '')
  const parts = relativePath.split(/[\\/]/).slice(1)
  const withoutExtension = parts
    .join('/')
    .replace(/\.[^.]+$/, '')
    .replace(/\/index$/, '')
  return `${prefix}/${withoutExtension}`.replace(/\/+/g, '/') || '/'
}

function joinRoute(parentPath: string, slug: string) {
  return `${parentPath.replace(/\/$/, '')}/${slug}`.replace(/\/+/g, '/') || '/'
}

function parentRoutePathFor(routePath: string) {
  const parts = routePath.split('/').filter(Boolean)
  if (parts.length <= 1) return null
  return `/${parts.slice(0, -1).join('/')}`
}

function orderRankForIndex(index: number) {
  return String(index).padStart(6, '0')
}

function collectAssetReferences(entries: FilesystemMigrationEntry[]) {
  const assets = new Map<string, Set<string>>()
  for (const entry of entries) {
    const source = JSON.stringify({ ...entry.shared, ...entry.localized })
    for (const match of source.matchAll(/["'(]([^"'()]+\.(?:png|jpe?g|gif|webp|svg|pdf))/gi)) {
      const asset = match[1]
      if (!asset) continue
      const referencedBy = assets.get(asset) ?? new Set<string>()
      referencedBy.add(entry.sourcePath)
      assets.set(asset, referencedBy)
    }
  }
  return Array.from(assets, ([sourcePath, referencedBy]) => ({
    sourcePath,
    referencedBy: Array.from(referencedBy).sort(),
  })).sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
}

function addAssetWarnings(args: {
  rootDir: string
  assets: FilesystemMigrationPlan['assets']
  warnings: FilesystemMigrationPlan['warnings']
}) {
  for (const asset of args.assets) {
    if (/^(?:https?:|data:|blob:|#)/i.test(asset.sourcePath)) continue
    const localPath = asset.sourcePath.startsWith('/')
      ? join(args.rootDir, asset.sourcePath.slice(1))
      : join(args.rootDir, asset.sourcePath)
    if (existsSync(localPath)) continue
    args.warnings.push({
      code: 'missing_asset',
      message: `Referenced asset "${asset.sourcePath}" does not exist in the filesystem import root.`,
      sourcePath: asset.referencedBy[0],
    })
  }
}

function publicFlagsFromFrontmatter(frontmatter: JsonRecord): FilesystemMigrationEntry['public'] {
  const flags: FilesystemMigrationEntry['public'] = {}
  if (typeof frontmatter.sitemap === 'boolean') flags.sitemap = frontmatter.sitemap
  if (typeof frontmatter.search === 'boolean') flags.search = frontmatter.search
  if (typeof frontmatter.navigation === 'boolean') flags.navigation = frontmatter.navigation
  return Object.keys(flags).length ? flags : undefined
}

function sharedFieldsFromFrontmatter(frontmatter: JsonRecord, fields: FieldConfig[]): JsonRecord {
  const localized = new Set(fields.filter((field) => field.localized).map((field) => field.key))
  return omit(frontmatter, [...reservedFrontmatterKeys, ...localized])
}

function localizedFieldsFromFrontmatter(
  frontmatter: JsonRecord,
  fields: FieldConfig[],
): JsonRecord {
  const localized = new Set(fields.filter((field) => field.localized).map((field) => field.key))
  return Object.fromEntries(Object.entries(frontmatter).filter(([key]) => localized.has(key)))
}

function relationReferencesFromFrontmatter(frontmatter: JsonRecord, fields: FieldConfig[]) {
  return fields
    .filter(
      (field) =>
        (field.type === 'relation' || field.type === 'relations') && field.relation?.collectionId,
    )
    .flatMap((field) => {
      if (!(field.key in frontmatter)) return []
      return [
        {
          field: field.key,
          collection: field.relation!.collectionId,
          value: frontmatter[field.key],
        },
      ]
    })
}

function addFieldMappingWarnings(args: {
  frontmatter: JsonRecord
  fields: FieldConfig[]
  warnings: FilesystemMigrationPlan['warnings']
  sourcePath: string
}) {
  if (!args.fields.length) return
  const fieldsByKey = new Map(args.fields.map((field) => [field.key, field]))
  for (const field of args.fields) {
    if (!field.required || field.key in args.frontmatter) continue
    args.warnings.push({
      code: 'schema_mismatch',
      message: `Required field "${field.key}" is missing from frontmatter.`,
      sourcePath: args.sourcePath,
    })
  }
  for (const [key, value] of Object.entries(args.frontmatter)) {
    if (reservedFrontmatterKeys.has(key)) continue
    const field = fieldsByKey.get(key)
    if (!field) {
      args.warnings.push({
        code: 'unknown_frontmatter_field',
        message: `Frontmatter field "${key}" is not defined in the code-defined collection contract.`,
        sourcePath: args.sourcePath,
      })
      continue
    }
    if (!fieldValueMatchesType(value, field)) {
      args.warnings.push({
        code: field.required ? 'invalid_required_field_type' : 'invalid_field_type',
        message: `Frontmatter field "${key}" does not match expected field type "${field.type}".`,
        sourcePath: args.sourcePath,
      })
    }
  }
}

function fieldValueMatchesType(value: unknown, field: FieldConfig) {
  if (value === undefined || value === null) return !field.required
  switch (field.type) {
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
    case 'icon':
    case 'code':
    case 'color':
      return typeof value === 'string'
    case 'number':
    case 'range':
      return typeof value === 'number'
    case 'checkbox':
    case 'toggle':
      return typeof value === 'boolean'
    case 'multiselect':
    case 'array':
    case 'blocks':
    case 'relations':
    case 'images':
      return Array.isArray(value)
    case 'object':
    case 'json':
      return isRecord(value) || Array.isArray(value)
    case 'relation':
    case 'image':
    case 'file':
      return typeof value === 'string' || isRecord(value)
    case 'divider':
    case 'section':
      return true
    default:
      return true
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toCollectionImport(collection: FilesystemMigrationPlan['collections'][number]) {
  return {
    slug: collection.slug,
    ...collection.config,
  }
}

function omit(record: JsonRecord, keys: string[]) {
  const omitted = new Set(keys)
  return Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)))
}

function walk(directory: string, budget: MigrationTraversalBudget, depth = 0): string[] {
  if (!existsSync(directory)) return []
  if (depth > MAX_MIGRATION_DEPTH) {
    throw new Error(
      `Filesystem migration exceeds maximum directory depth (${MAX_MIGRATION_DEPTH}).`,
    )
  }
  const directoryStats = lstatSync(directory)
  if (directoryStats.isSymbolicLink()) {
    throw new Error(`Filesystem migration rejects symbolic links: ${directory}`)
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(`Filesystem migration expected a directory: ${directory}`)
  }
  const realDirectory = realpathSync(directory)
  if (budget.directories.has(realDirectory)) {
    throw new Error(`Filesystem migration encountered a repeated directory: ${directory}`)
  }
  budget.directories.add(realDirectory)
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) {
      throw new Error(`Filesystem migration rejects symbolic links: ${path}`)
    }
    if (stats.isDirectory()) return walk(path, budget, depth + 1)
    if (!stats.isFile()) {
      throw new Error(`Filesystem migration rejects non-file input: ${path}`)
    }
    budget.files += 1
    budget.bytes += stats.size
    if (budget.files > MAX_MIGRATION_FILES) {
      throw new Error(`Filesystem migration exceeds maximum file count (${MAX_MIGRATION_FILES}).`)
    }
    if (budget.bytes > MAX_MIGRATION_BYTES) {
      throw new Error(`Filesystem migration exceeds maximum input bytes (${MAX_MIGRATION_BYTES}).`)
    }
    return [path]
  })
}
