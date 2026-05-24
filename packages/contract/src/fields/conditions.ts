import { isPlainObject, resolveContextValue, emptyForType } from '../utils.js'

export function evaluateFieldCondition(
  condition: Record<string, unknown> | null | undefined,
  context: Record<string, unknown>,
): boolean {
  if (!condition) return true

  if (Array.isArray(condition.and)) {
    return condition.and.every((item) =>
      evaluateFieldCondition(isPlainObject(item) ? item : undefined, context),
    )
  }

  if (Array.isArray(condition.or)) {
    return condition.or.some((item) =>
      evaluateFieldCondition(isPlainObject(item) ? item : undefined, context),
    )
  }

  const fieldPath =
    typeof condition.field === 'string'
      ? condition.field
      : typeof condition.key === 'string'
        ? condition.key
        : undefined
  if (!fieldPath) return true

  const actual = resolveContextValue(context, fieldPath)

  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    return actual === condition.equals
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
    return actual !== condition.notEquals
  }
  if (Array.isArray(condition.in)) {
    return condition.in.includes(actual as never)
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'truthy')) {
    return condition.truthy ? !emptyForType('text', actual) : emptyForType('text', actual)
  }

  return true
}
