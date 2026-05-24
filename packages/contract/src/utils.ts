export function structuredCloneSafe<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function isEqualJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null) return left === right
  if (typeof left !== typeof right) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    return left.every((value, index) => isEqualJsonValue(value, right[index]))
  }

  if (typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      isEqualJsonValue(leftRecord[key], rightRecord[key]),
  )
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function resolveContextValue(context: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (!isPlainObject(current)) return undefined
      return current[segment]
    }, context)
}

export function emptyForType(type: string, value: unknown): boolean {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'email':
    case 'url':
    case 'slug':
    case 'date':
    case 'datetime':
    case 'time':
    case 'code':
    case 'icon':
    case 'color':
      return value === undefined || value === null || value === ''
    case 'number':
    case 'range':
      return value === undefined || value === null
    case 'checkbox':
    case 'toggle':
      return value === undefined || value === null
    case 'multiselect':
    case 'images':
    case 'relations':
    case 'array':
    case 'blocks':
      return value === undefined || value === null || (Array.isArray(value) && value.length === 0)
    default:
      return value === undefined || value === null
  }
}
