import type { CollectionConfig, FieldConfig, ModuleOptions } from './options.js'

const jsonMapType = 'Record<string, JsonValue>'

export function renderPublicContractTypes(options: ModuleOptions): string {
  const locales = options.locales.length
    ? options.locales.map((locale) => locale.code)
    : [options.defaultLocale]
  const collectionEntries = Object.entries(options.collections).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const singletonEntries = collectionEntries.filter(
    ([, collection]) => collection.routing.singleton === true,
  )

  return [
    "import type { GinkoPublicEntry, JsonValue } from '@lupinum/ginko-cms/public'",
    '',
    `type GinkoGeneratedLocale = ${unionType(locales)}`,
    '',
    ...collectionEntries.flatMap(([slug, collection]) =>
      renderCollectionDataTypes(slug, collection),
    ),
    'export interface GinkoCollections {',
    `  locales: GinkoGeneratedLocale`,
    '  collections: {',
    ...collectionEntries.map(([slug, collection]) => renderCollectionContract(slug, collection)),
    '  }',
    '  singletons: {',
    ...singletonEntries.map(([slug]) => {
      const typeName = collectionDataTypeName(slug)
      return `    ${quoteKey(slug)}: GinkoPublicEntry<${quote(slug)}, ${typeName}, GinkoGeneratedLocale>`
    }),
    '  }',
    '  siteData: {}',
    '}',
    '',
    'export type GinkoCollectionName = keyof GinkoCollections["collections"] & string',
    'export type GinkoRouteBackedCollectionName = {',
    '  [Collection in GinkoCollectionName]: GinkoCollections["collections"][Collection]["routeBacked"] extends true ? Collection : never',
    '}[GinkoCollectionName]',
    'export type GinkoDataCollectionName = Exclude<GinkoCollectionName, GinkoRouteBackedCollectionName>',
    'export type GinkoEntry<Collection extends GinkoCollectionName> = GinkoCollections["collections"][Collection]["list"]',
    'export type GinkoPageEntry<Collection extends GinkoRouteBackedCollectionName> = GinkoCollections["collections"][Collection]["page"]',
    'export type GinkoListEntry<Collection extends GinkoCollectionName> = GinkoCollections["collections"][Collection]["list"]',
    'export type GinkoSearchEntry = { [Collection in GinkoCollectionName]: GinkoCollections["collections"][Collection]["search"] }[GinkoCollectionName]',
    'export type GinkoNavEntry<Collection extends GinkoRouteBackedCollectionName> = GinkoCollections["collections"][Collection]["nav"]',
    'export type GinkoPageInput<Collection extends GinkoRouteBackedCollectionName = GinkoRouteBackedCollectionName> = { collection: Collection; path: string; locale?: GinkoGeneratedLocale }',
    'export type GinkoListInput<Collection extends GinkoCollectionName = GinkoCollectionName> = { collection: Collection; locale?: GinkoGeneratedLocale; limit?: number; cursor?: string | null }',
    'export type GinkoSearchInput = { query: string; locale?: GinkoGeneratedLocale; collection?: GinkoCollectionName; collections?: GinkoCollectionName[]; limit?: number; cursor?: string | null }',
    'export type GinkoNavInput<Collection extends GinkoRouteBackedCollectionName = GinkoRouteBackedCollectionName> = { collection: Collection; locale?: GinkoGeneratedLocale }',
    '',
  ].join('\n')
}

function renderCollectionDataTypes(slug: string, collection: CollectionConfig) {
  const publicFields = (collection.fields ?? []).filter((field) => !field.hidden)
  const typeName = collectionDataTypeName(slug)
  if (!publicFields.length) {
    return [`type ${typeName} = ${jsonMapType}`, '']
  }

  return [`interface ${typeName} {`, ...publicFields.map((field) => renderField(field, 2)), '}', '']
}

function renderCollectionContract(slug: string, collection: CollectionConfig) {
  const typeName = collectionDataTypeName(slug)
  const entryType = `GinkoPublicEntry<${quote(slug)}, ${typeName}, GinkoGeneratedLocale>`
  const routeBacked = (collection.routing.mode ?? 'route') === 'route'
  return [
    `    ${quoteKey(slug)}: {`,
    `      page: ${entryType}`,
    `      list: ${entryType}`,
    `      search: ${entryType}`,
    `      nav: ${entryType}`,
    '      sort: never',
    `      routeBacked: ${routeBacked ? 'true' : 'false'}`,
    '    }',
  ].join('\n')
}

function renderField(field: FieldConfig, indent: number): string {
  const optional = field.required ? '' : '?'
  return `${' '.repeat(indent)}${quoteKey(field.key)}${optional}: ${fieldType(field)}`
}

function fieldType(field: FieldConfig): string {
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
    case 'image':
    case 'file':
    case 'relation':
      return nullable('string', field)
    case 'number':
    case 'range':
      return nullable('number', field)
    case 'checkbox':
    case 'toggle':
      return nullable('boolean', field)
    case 'multiselect':
    case 'images':
    case 'relations':
      return nullable('string[]', field)
    case 'object':
      return nullable(objectType(field.fields ?? []), field)
    case 'array':
      return nullable(
        `Array<${field.fields?.length ? objectType(field.fields) : 'JsonValue'}>`,
        field,
      )
    case 'blocks':
    case 'json':
      return nullable('JsonValue', field)
    case 'divider':
    case 'section':
      return 'never'
    default:
      return nullable('JsonValue', field)
  }
}

function objectType(fields: FieldConfig[]): string {
  const publicFields = fields.filter((field) => !field.hidden)
  if (!publicFields.length) return jsonMapType
  return ['{', ...publicFields.map((field) => renderField(field, 2)), '}'].join('\n')
}

function nullable(type: string, field: FieldConfig) {
  return field.required ? type : `${type} | null`
}

function collectionDataTypeName(slug: string) {
  return `Ginko${pascalCase(slug)}Data`
}

function pascalCase(value: string) {
  const normalized = value
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')
  return normalized || 'Collection'
}

function unionType(values: string[]) {
  const unique = Array.from(new Set(values)).filter(Boolean)
  return unique.length ? unique.map(quote).join(' | ') : 'string'
}

function quote(value: string) {
  return JSON.stringify(value)
}

function quoteKey(value: string) {
  return /^[A-Z_$][\w$]*$/i.test(value) ? value : quote(value)
}
