type JsonRecord = Record<string, unknown>

const redactedValue = '[redacted]'
const omittedInternalField = '[internal]'
const secretFieldNames = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'bearer',
  'clientsecret',
  'confirmationtoken',
  'cookie',
  'deploykey',
  'password',
  'passwordhash',
  'rawtoken',
  'refreshtoken',
  'secret',
  'secretfingerprint',
  'setcookie',
  'token',
  'tokenhash',
])
const internalFieldNames = new Set(['_creationTime'])

function normalizeFieldName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function shouldRedactField(name: string): boolean {
  return secretFieldNames.has(normalizeFieldName(name))
}

function shouldOmitInternalField(name: string): boolean {
  return internalFieldNames.has(name)
}

export function redactMcpResponse(value: unknown, seen = new WeakSet<object>()): unknown {
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
    if (shouldRedactField(key)) {
      redacted[key] = redactedValue
      continue
    }
    redacted[key] = redactMcpResponse(nested, seen)
  }
  return redacted
}
