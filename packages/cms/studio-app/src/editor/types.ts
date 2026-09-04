export type JsonPrimitive = boolean | null | number | string

export interface JsonRecord {
  [key: string]: JsonValue | undefined
}

export type JsonValue = JsonPrimitive | JsonRecord | JsonValue[]

export interface AssetInfo {
  id: string
  filename: string
  url: string
  alt?: string
  title?: string
  width?: number
  height?: number
  size?: number
  mimeType?: string
  thumbnailUrl?: string | null
  thumbnailWidth?: number
  thumbnailHeight?: number
  fit?: string
  quality?: number
  focalX?: number
  focalY?: number
  cropX?: number
  cropY?: number
  cropWidth?: number
  cropHeight?: number
  scope?: 'entry' | 'collection' | 'global'
  collection?: string
  entryId?: string
  ownerName?: string | null
  tags?: string[]
  createdAt?: number
  updatedAt?: number
}

export interface AssetProvider {
  buildUrl: (asset: Partial<AssetInfo>) => string
  parseUrl: (url: string) => Partial<AssetInfo> | null
}

export interface PropFormItem {
  custom?: boolean
  default?: PropValue
  key: string
  label: string
  options?: readonly string[] | string[]
  type: PropType
  value: PropValue
}

export type PropType = 'array' | 'boolean' | 'number' | 'object' | 'select' | 'string'

export type PropValue = JsonValue | undefined
