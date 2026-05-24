import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadGinkoContentCollections } from './content-contract.js'
import type { CollectionConfig, LocaleConfig, ModuleOptions } from './options.js'

type CollectionFileConfig = CollectionConfig & { slug?: string }

export function loadCollectionsFromDir(rootDir: string, collectionsDir?: string) {
  if (!collectionsDir) return {}
  const directory = resolve(rootDir, collectionsDir)
  if (!existsSync(directory)) return {}

  const collections: Record<string, CollectionConfig> = {}
  const files = readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))

  for (const file of files) {
    const fullPath = resolve(directory, file)
    if (!statSync(fullPath).isFile()) continue
    const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as
      | CollectionFileConfig
      | CollectionFileConfig[]
    const entries = Array.isArray(parsed) ? parsed : [parsed]

    for (const entry of entries) {
      const slug = entry.slug ?? file.replace(/\.json$/i, '')
      if (!slug || slug === 'all') continue
      const { slug: _slug, ...collection } = entry
      collections[slug] = collection
    }
  }

  return collections
}

export async function resolveConfiguredCollections(options: {
  rootDir: string
  moduleOptions: ModuleOptions
  defaultLocale: string
  locales: LocaleConfig[]
}): Promise<Record<string, CollectionConfig>> {
  const fileCollections = {
    ...loadCollectionsFromDir(options.rootDir, options.moduleOptions.collectionsDir),
    ...options.moduleOptions.collections,
  }
  const contentCollections =
    options.moduleOptions.content === false
      ? {}
      : await loadGinkoContentCollections({
          rootDir: options.rootDir,
          defaultLocale: options.defaultLocale,
          locales: options.locales,
          include: options.moduleOptions.content?.collections,
          overrides: options.moduleOptions.content?.overrides,
          translatedSlugs: options.moduleOptions.contentTranslatedSlugs,
        })

  return {
    ...contentCollections,
    ...fileCollections,
  }
}
