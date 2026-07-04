import { createHash } from 'node:crypto'

import { parseMcpBearerApiKey, type BetterAuthApiKeyVerifier } from './better-auth-api-key.js'

const STORAGE_NAMESPACE = 'cache:ginko:mcp-auth'
const GRACE_WINDOW_MS = 30_000
const IP_LIMIT = { key: 'ip', max: 30, windowMs: 60_000, ttlSeconds: 60 }
const HASH_LIMIT = { key: 'hash', max: 5, windowMs: 300_000, ttlSeconds: 300 }
const GRACE_SWEEP_INTERVAL = 64
const MAX_GRACE_AGE_MS = Math.max(IP_LIMIT.windowMs, HASH_LIMIT.windowMs)

type StorageValue = number[]

export type McpAuthStorage = {
  getItem(key: string): Promise<StorageValue | null>
  setItem(key: string, value: StorageValue, options: { ttl: number }): Promise<void>
}

export type McpAuthErrorFactory = (input: {
  statusCode: number
  statusMessage: string
}) => Error & { statusCode: number; statusMessage: string }

type FailureBudgetDeps = {
  getStorage: () => Promise<McpAuthStorage>
  createError: McpAuthErrorFactory
}

type ResolvedMcpCredentialAccess = {
  apiKeyId: string
  ownerUserId: string
}

type AuthenticateDeps = FailureBudgetDeps & {
  verifyApiKey: BetterAuthApiKeyVerifier
  getConvexAuthToken: (apiKey: string) => Promise<string>
  resolveCredentialAccess: (
    apiKeyId: string,
    convexAuthToken: string,
  ) => Promise<ResolvedMcpCredentialAccess | null>
  now?: () => number
}

type AuthenticateInput = {
  path?: string | null
  authorizationHeader?: string | null
  clientIp?: string | null
  context: Record<string, unknown>
}

const graceBuckets = new Map<string, number[]>()
let lastHealthyStorageAt = 0
let graceAccessCount = 0

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sanitizeKeyPart(value: string | null | undefined, fallback: string) {
  const cleaned = value?.trim().replace(/[^\w:-]+/g, '-')
  return cleaned && cleaned.length > 0 ? cleaned : fallback
}

function bucketKey(kind: 'ip' | 'hash', value: string | null | undefined) {
  return `${kind}:${sanitizeKeyPart(value, 'unknown')}`
}

function pruneWindow(values: number[], now: number, windowMs: number) {
  return values.filter((entry) => now - entry < windowMs)
}

function checkWindow(values: number[], max: number) {
  return values.length < max
}

function readGraceBucket(key: string, now: number, windowMs: number) {
  const current = graceBuckets.get(key) ?? []
  const pruned = pruneWindow(current, now, windowMs)
  graceBuckets.set(key, pruned)
  maybeSweepGraceBuckets(now)
  return pruned
}

function maybeSweepGraceBuckets(now: number) {
  graceAccessCount += 1
  if (graceAccessCount % GRACE_SWEEP_INTERVAL !== 0) return

  for (const [key, values] of graceBuckets.entries()) {
    const pruned = pruneWindow(values, now, MAX_GRACE_AGE_MS)
    if (pruned.length === 0) {
      graceBuckets.delete(key)
      continue
    }
    graceBuckets.set(key, pruned)
  }
}

async function enforceFailureBudget(
  input: { ip: string | null; hash: string; now: number },
  deps: FailureBudgetDeps,
) {
  const checks = [
    { config: IP_LIMIT, key: bucketKey('ip', input.ip) },
    { config: HASH_LIMIT, key: bucketKey('hash', input.hash) },
  ]

  try {
    const storage = await deps.getStorage()
    for (const { config, key } of checks) {
      const values = pruneWindow((await storage.getItem(key)) ?? [], input.now, config.windowMs)
      if (!checkWindow(values, config.max)) {
        throw deps.createError({
          statusCode: 429,
          statusMessage: 'Too many invalid MCP authentication attempts',
        })
      }
    }
    lastHealthyStorageAt = input.now
    return {
      async recordFailure() {
        for (const { config, key } of checks) {
          const values = pruneWindow((await storage.getItem(key)) ?? [], input.now, config.windowMs)
          values.push(input.now)
          await storage.setItem(key, values, { ttl: config.ttlSeconds })
        }
        lastHealthyStorageAt = input.now
      },
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    if (input.now - lastHealthyStorageAt > GRACE_WINDOW_MS) {
      throw deps.createError({
        statusCode: 503,
        statusMessage: 'MCP authentication temporarily unavailable',
      })
    }

    for (const { config, key } of checks) {
      const values = readGraceBucket(key, input.now, config.windowMs)
      if (!checkWindow(values, config.max)) {
        throw deps.createError({
          statusCode: 429,
          statusMessage: 'Too many invalid MCP authentication attempts',
        })
      }
    }

    return {
      async recordFailure() {
        for (const { key } of checks) {
          const values = graceBuckets.get(key) ?? []
          values.push(input.now)
          graceBuckets.set(key, values)
        }
      },
    }
  }
}

export async function authenticateMcpRequestContext(
  input: AuthenticateInput,
  deps: AuthenticateDeps,
) {
  if (!input.path?.startsWith('/mcp')) return

  const token = parseMcpBearerApiKey(input.authorizationHeader)
  if (!token) {
    throw deps.createError({
      statusCode: 401,
      statusMessage: 'MCP authentication required',
    })
  }

  const now = deps.now?.() ?? Date.now()
  const hash = hashToken(token)
  const clientIp = input.clientIp ?? null
  const limiter = await enforceFailureBudget({ ip: clientIp, hash, now }, deps)

  let verified: Awaited<ReturnType<BetterAuthApiKeyVerifier>>
  try {
    verified = await deps.verifyApiKey({ key: token })
  } catch {
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  if (!verified.valid || !verified.key) {
    await limiter.recordFailure()
    throw deps.createError({
      statusCode: 401,
      statusMessage: 'Invalid MCP authentication token',
    })
  }

  let convexAuthToken: string
  try {
    convexAuthToken = await deps.getConvexAuthToken(token)
  } catch {
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  let access: ResolvedMcpCredentialAccess | null
  try {
    access = await deps.resolveCredentialAccess(verified.key.id, convexAuthToken)
  } catch {
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  if (!access || access.ownerUserId !== verified.key.referenceId) {
    await limiter.recordFailure()
    throw deps.createError({
      statusCode: 401,
      statusMessage: 'Invalid MCP credential settings',
    })
  }

  input.context.mcpAuth = {
    apiKeyId: verified.key.id,
    authUserId: verified.key.referenceId,
    convexAuthToken,
  }
}

export function getMcpAuthStorageNamespace() {
  return STORAGE_NAMESPACE
}

export function resetMcpAuthState() {
  graceBuckets.clear()
  lastHealthyStorageAt = 0
  graceAccessCount = 0
}
