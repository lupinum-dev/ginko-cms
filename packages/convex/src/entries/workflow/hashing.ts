/**
 * Stable hashing helpers used by the workflow commands.
 *
 * `draftHash`: hashes the canonical-shaped draft state captured by a
 * preview, so the publish path can detect drift even when draftVersion
 * happens to match (e.g. a concurrent revert that brought draftVersion
 * back to the same number with different content).
 *
 * `argsHash`: hashes the preview-call args so a later publish can confirm
 * "the preview was issued for the same args you're publishing with."
 *
 * The hash function is FNV-1a over a JSON canonicalization. Cryptographic
 * strength isn't required - the hash is paired with a server-stored,
 * single-use token, so the integrity boundary is the token itself.
 */

import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`).join(',')}}`
  }
  return 'null'
}

function fnv1a(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Hash a JSON-shaped value into a stable, deterministic string. Same input
 * yields same output regardless of object key order.
 */
export function stableHash(value: JsonValue | unknown): string {
  return fnv1a(canonicalJson(value))
}
