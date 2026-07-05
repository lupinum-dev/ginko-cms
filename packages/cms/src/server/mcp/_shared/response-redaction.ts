import {
  isPublicSecretReferenceField,
  redactedValue,
  redactSecretString,
  shouldRedactSecretField,
} from '../../../public/utils/secretRedaction.js'

type JsonRecord = Record<string, unknown>

const omittedInternalField = '[internal]'
const internalFieldNames = new Set(['_creationTime'])

function shouldOmitInternalField(name: string): boolean {
  return internalFieldNames.has(name)
}

export function redactMcpResponse(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactSecretString(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return redactedValue
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactMcpResponse(item, seen))

  const redacted: JsonRecord = {}
  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    if (shouldOmitInternalField(key)) {
      redacted[key] = omittedInternalField
      continue
    }
    if (isPublicSecretReferenceField(key)) {
      redacted[key] = nested
      continue
    }
    if (shouldRedactSecretField(key)) {
      redacted[key] = redactedValue
      continue
    }
    redacted[key] = redactMcpResponse(nested, seen)
  }
  return redacted
}
