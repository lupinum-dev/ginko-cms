function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
    .join(',')}}`
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashValue(value: unknown): Promise<string> {
  return await sha256Hex(stableJson(value))
}

export function createToken(): string {
  const platformCrypto = globalThis.crypto
  if (typeof platformCrypto?.randomUUID === 'function') return platformCrypto.randomUUID()
  if (typeof platformCrypto?.getRandomValues !== 'function') {
    throw new TypeError('Secure platform randomness is required for operation confirmations.')
  }
  const bytes = new Uint8Array(32)
  platformCrypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
