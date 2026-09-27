import type { CmsField, JsonValue } from '../types.js'

/** The installed Content contract owns whether this collection has an article body. */
export function getCollectionBodyField(collection: {
  settings?: JsonValue
  fields?: readonly Pick<CmsField, 'key' | 'type'>[]
}): string | null {
  const settings = collection.settings
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const portable = settings.portable
    if (portable && typeof portable === 'object' && !Array.isArray(portable)) {
      if (portable.bodyField === null) return null
      if (typeof portable.bodyField === 'string') return portable.bodyField
    }
  }
  // Legacy in-memory collection fixtures predate the installed portable contract.
  return collection.fields?.find((field) => field.type === 'richtext')?.key ?? null
}
