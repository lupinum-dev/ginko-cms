import type { CollectionConfig, FieldConfig, ModuleOptions } from '../module/options.js'

type FieldInput = Omit<FieldConfig, 'key' | 'type'>
type OptionInput = string | { label: string; value: string }

function field(type: FieldConfig['type']) {
  return (key: string, options: FieldInput = {}): FieldConfig => ({
    key,
    type,
    ...options,
  })
}

function options(values: OptionInput[]) {
  return values.map((item) => (typeof item === 'string' ? item : item.value))
}

export const ginkoFields = {
  text: field('text'),
  textarea: field('textarea'),
  richtext: field('richtext'),
  slug: field('slug'),
  email: field('email'),
  url: field('url'),
  number: field('number'),
  range: field('range'),
  boolean: field('toggle'),
  checkbox: field('checkbox'),
  date: field('date'),
  datetime: field('datetime'),
  select: (key: string, values: OptionInput[], fieldOptions: FieldInput = {}) =>
    field('select')(key, { ...fieldOptions, options: options(values) }),
  multiselect: (key: string, values: OptionInput[], fieldOptions: FieldInput = {}) =>
    field('multiselect')(key, { ...fieldOptions, options: options(values) }),
  relation: (key: string, collectionId: string, fieldOptions: FieldInput = {}) =>
    field('relation')(key, { ...fieldOptions, relation: { collectionId, multiple: false } }),
  relations: (key: string, collectionId: string, fieldOptions: FieldInput = {}) =>
    field('relations')(key, { ...fieldOptions, relation: { collectionId, multiple: true } }),
  image: field('image'),
  images: field('images'),
  file: field('file'),
  object: (key: string, fields: FieldConfig[], fieldOptions: FieldInput = {}) =>
    field('object')(key, { ...fieldOptions, fields }),
  array: (key: string, fields: FieldConfig[], fieldOptions: FieldInput = {}) =>
    field('array')(key, { ...fieldOptions, fields }),
  blocks: (key: string, fields: FieldConfig[], fieldOptions: FieldInput = {}) =>
    field('blocks')(key, { ...fieldOptions, fields }),
  json: field('json'),
  code: field('code'),
  color: field('color'),
  divider: field('divider'),
  section: field('section'),
} satisfies Record<string, unknown>

export function defineGinkoCollection(config: CollectionConfig): CollectionConfig {
  return config
}

export function routeBackedCollection(
  config: Omit<CollectionConfig, 'routing'> & {
    routing: Omit<CollectionConfig['routing'], 'mode'> & { mode?: 'route' }
  },
): CollectionConfig {
  return {
    ...config,
    routing: {
      ...config.routing,
      mode: 'route',
    },
  }
}

export function dataCollection(
  config: Omit<CollectionConfig, 'routing'> & {
    routing?: Partial<CollectionConfig['routing']>
  },
): CollectionConfig {
  return {
    ...config,
    routing: {
      pathPrefix: '',
      ...config.routing,
      mode: 'none',
    },
  }
}

export function defineGinkoCmsConfig(config: Partial<ModuleOptions>): Partial<ModuleOptions> {
  return config
}

export type { CollectionConfig, FieldConfig, ModuleOptions }
