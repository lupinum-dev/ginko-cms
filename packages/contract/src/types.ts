export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export type JsonObject = {
  [key: string]: JsonValue
}

export type JsonArray = JsonValue[]

export type JsonMap = Record<string, JsonValue>

export type JsonRecord = {
  [key: string]: JsonValue | undefined
}

export type LocaleText = string | Record<string, string>

export type SlugMode = 'shared' | 'localized' | 'stable' | 'localizedStable'

export type CollectionType = 'flat' | 'tree'
export type CollectionMode = 'route' | 'none'

export type CmsRole = 'owner' | 'publisher' | 'editor' | 'viewer'

export type EntryStatus = 'draft' | 'published' | 'archived'

export type NodeKind = 'page' | 'folder' | 'group' | 'section'

export type AssetScope = 'global' | 'collection' | 'entry'

export type SortDirection = 'asc' | 'desc'

export type ActivityOutcome = 'applied' | 'failed' | 'blocked' | 'stale'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'slug'
  | 'email'
  | 'url'
  | 'number'
  | 'range'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'toggle'
  | 'date'
  | 'datetime'
  | 'time'
  | 'json'
  | 'object'
  | 'array'
  | 'blocks'
  | 'relation'
  | 'relations'
  | 'image'
  | 'images'
  | 'file'
  | 'icon'
  | 'code'
  | 'color'
  | 'divider'
  | 'section'

export type RelationDefinition = {
  collection: string
  multiple?: boolean
}

export type MediaDefinition = {
  accept?: string[]
  aspectRatio?: string | null
}

export type FieldCondition = JsonObject

export type FieldDefinition = {
  key: string
  type: FieldType
  label?: LocaleText | null
  description?: string | null
  required?: boolean
  localized?: boolean
  hidden?: boolean
  searchable?: boolean
  sortable?: boolean
  order?: number
  width?: 'full' | 'half'
  defaultValue?: JsonValue
  validation?: JsonObject | null
  condition?: FieldCondition | null
  options?: string[] | null
  relation?: RelationDefinition | null
  media?: MediaDefinition | null
  fields?: FieldDefinition[] | null
  min?: number | null
  max?: number | null
  step?: number | null
  slugFrom?: string | null
  language?: string | null
}

export type CollectionRouting = {
  mode?: CollectionMode
  pathPrefix: string
  slugMode?: SlugMode
  rootSlug?: string | null
  singleton?: boolean
}

export type LocaleConfig = {
  code: string
  label?: string
  isDefault?: boolean
  fallback?: string
}

export type CollectionDefinition = {
  slug: string
  label: LocaleText
  icon?: string | null
  type: CollectionType
  routing: CollectionRouting
  locales: string[]
  fields: FieldDefinition[]
  settings?: JsonValue
}

export type CmsField = FieldDefinition

export type LocaleState = {
  values: JsonMap
  bodyMdc?: string | null
}

export type ValidationError = {
  field: string
  message: string
}

export type CompletionState = {
  filledRequired: number
  totalRequired: number
  complete: boolean
  errors: ValidationError[]
}
