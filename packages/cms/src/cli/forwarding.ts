import { createHash, createHmac, randomUUID } from 'node:crypto'

import { cmsDeployCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'

const deployKeyCmsCaller = cmsDeployCaller('ginko-cms-cli')
const forwardingHeaderType = 'trellis-forwarding+jws'
const forwardingIssuer = 'trellis://server'
const forwardingAudience = 'trellis://convex'
const forwardingKeyId = 'default'
const forwardingTtlsMs = {
  query: 60_000,
  mutation: 30_000,
} as const
const excludedForwardingArgKeys = new Set([
  '_trellisForwarding',
  '_trellisForwardingKey',
  '_identityForwardingKey',
  '_identityForwarding',
  '__trellis',
])

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry ?? null)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'undefined') return 'null'
  return JSON.stringify(value)
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function canonicalizeForwardingArgs(args: unknown): string {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return canonicalJson(args)

  const filtered = Object.fromEntries(
    Object.entries(args as Record<string, unknown>).filter(
      ([key, entry]) => entry !== undefined && !excludedForwardingArgKeys.has(key),
    ),
  )
  return canonicalJson(filtered)
}

function hashForwardingArgs(args: unknown): string {
  return createHash('sha256').update(canonicalizeForwardingArgs(args)).digest('base64url')
}

function signForwardingInput(input: string, key: string): string {
  return createHmac('sha256', key).update(input).digest('base64url')
}

function createDeployKeyForwardingEnvelope(options: {
  functionRef: string
  purpose: 'query' | 'mutation'
  identityForwardingKey: string
  args: Record<string, unknown>
}) {
  const keyId = process.env.CONVEX_IDENTITY_FORWARDING_KEY_ID || forwardingKeyId
  const now = Date.now()
  const subject = deployKeyCmsCaller.subject
  const payload = {
    v: 1,
    kid: keyId,
    iss: forwardingIssuer,
    aud: forwardingAudience,
    jti: `ginko-cms-cli-${randomUUID()}`,
    sub: subject,
    caller: { ...deployKeyCmsCaller, subject },
    transport: 'bridge',
    purpose: options.purpose,
    ...(options.purpose === 'mutation' ? { replayMode: 'jti-redemption' } : {}),
    functionRef: options.functionRef,
    argsHash: hashForwardingArgs(options.args),
    issuedAt: now,
    expiresAt: now + forwardingTtlsMs[options.purpose],
  }
  const header = {
    alg: 'HS256',
    kid: keyId,
    typ: forwardingHeaderType,
    v: 1,
  }
  const signingInput = `${base64UrlEncode(canonicalJson(header))}.${base64UrlEncode(
    canonicalJson(payload),
  )}`
  return `${signingInput}.${signForwardingInput(signingInput, options.identityForwardingKey)}`
}

export function withDeployKeyForwarding<TArgs extends Record<string, unknown>>(
  args: TArgs,
  options: {
    functionRef: string
    purpose: 'query' | 'mutation'
    identityForwardingKey: string
    envelopeArgs?: Record<string, unknown>
  },
): TArgs & { _trellisForwarding: string } {
  // Internal bridge root wrappers verify forwarding before app args are merged;
  // the component call they perform signs the real app args again.
  const envelopeArgs = options.envelopeArgs ?? args

  return {
    ...args,
    _trellisForwarding: createDeployKeyForwardingEnvelope({
      purpose: options.purpose,
      functionRef: options.functionRef,
      args: envelopeArgs,
      identityForwardingKey: options.identityForwardingKey,
    }),
  }
}
