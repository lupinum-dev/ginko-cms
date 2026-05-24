import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { isEqualJsonValue } from '@lupinum/ginko-cms-contract/shared/utils.js'

export { isEqualJsonValue }

export function applyFieldDiff(target: JsonMap, patch: JsonMap, fields: string[]): JsonMap {
  const next: Record<string, JsonMap[string] | undefined> = { ...target }

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      next[field] = patch[field]
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete next[field]
  }

  return next as JsonMap
}
