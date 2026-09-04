export const redactedValue = '[redacted]'

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
  'session',
  'sessiontoken',
  'token',
  'tokenhash',
])

const publicSecretReferenceFieldNames = new Set(['apikeyid'])

const secretValuePatterns = [
  /\bBearer\s+[\w.~+/=-]{8,}\b/gi,
  /\bba_[\w.~+/=-]{6,}\b/g,
  /\bcms_[\w.~+/=-]{12,}\b/g,
  /\bmcp_[\w.~+/=-]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bconfirmation[_-]?token[:=]\s*[\w.~+/=-]{8,}\b/gi,
]

function normalizeFieldName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function shouldRedactSecretField(name: string): boolean {
  const normalized = normalizeFieldName(name)
  if (isPublicSecretReferenceField(name)) return false
  return (
    secretFieldNames.has(normalized) ||
    normalized.includes('apikey') ||
    normalized.includes('authorization') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token')
  )
}

export function isPublicSecretReferenceField(name: string): boolean {
  return publicSecretReferenceFieldNames.has(normalizeFieldName(name))
}

export function redactSecretString(value: string): string {
  return secretValuePatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, redactedValue),
    value,
  )
}
