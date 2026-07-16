import { randomUUID } from 'node:crypto'

import {
  deriveMcpLimiterBucketKey,
  signMcpLimiterPayload,
  type McpLimiterOperation,
} from '@lupinum/ginko-cms-convex/convex.auth'
import type { ServerConvexCaller } from 'better-convex-nuxt/server'

import { parseMcpBearerApiKey } from './better-auth-api-key.js'

export type McpAuthErrorFactory = (input: {
  statusCode: number
  statusMessage: string
}) => Error & { statusCode: number; statusMessage: string }

type ResolvedMcpCredentialAccess = {
  apiKeyId: string
  ownerUserId: string
}

type SignedLimiterArgs = {
  ipBucketKey: string
  credentialBucketKey: string
  requestId: string
  timestamp: number
  signature: string
}

export interface ExchangedMcpCredential {
  apiKeyId: string
  ownerUserId: string
  caller: Pick<ServerConvexCaller, 'query' | 'mutation' | 'action'>
}

export type AuthenticateDeps = {
  createError: McpAuthErrorFactory
  limiterSecret: string
  checkFailureBudget: (args: SignedLimiterArgs) => Promise<{ limited: boolean }>
  recordFailure: (args: SignedLimiterArgs) => Promise<{ limited: boolean }>
  exchangeCredential: (credential: string) => Promise<ExchangedMcpCredential | null>
  resolveCredentialAccess: (
    apiKeyId: string,
    caller: ExchangedMcpCredential['caller'],
  ) => Promise<ResolvedMcpCredentialAccess | null>
  now?: () => number
  requestId?: () => string
}

type AuthenticateInput = {
  path?: string | null
  authorizationHeader?: string | null
  clientIp?: string | null
  context: Record<string, unknown>
}

function statusCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null
  return typeof error.statusCode === 'number' ? error.statusCode : null
}

async function signedLimiterArgs(
  deps: AuthenticateDeps,
  args: {
    operation: McpLimiterOperation
    clientIp: string | null
    credential: string
    requestId: string
    timestamp: number
  },
): Promise<SignedLimiterArgs> {
  const [ipBucketKey, credentialBucketKey] = await Promise.all([
    deriveMcpLimiterBucketKey(deps.limiterSecret, 'ip', args.clientIp ?? 'unknown'),
    deriveMcpLimiterBucketKey(deps.limiterSecret, 'credential', args.credential),
  ])
  const payload = {
    operation: args.operation,
    ipBucketKey,
    credentialBucketKey,
    requestId: args.requestId,
    timestamp: args.timestamp,
  }
  return {
    ...payload,
    signature: await signMcpLimiterPayload(deps.limiterSecret, payload),
  }
}

async function readFailureBudget(
  input: { clientIp: string | null; credential: string; requestId: string },
  deps: AuthenticateDeps,
) {
  const timestamp = deps.now?.() ?? Date.now()
  try {
    const args = await signedLimiterArgs(deps, {
      operation: 'check',
      ...input,
      timestamp,
    })
    const result = await deps.checkFailureBudget(args)
    if (result.limited) {
      throw deps.createError({
        statusCode: 429,
        statusMessage: 'Too many invalid MCP authentication attempts',
      })
    }
  } catch (error) {
    if (statusCode(error) === 429) throw error
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  return {
    async recordFailure() {
      try {
        const timestamp = deps.now?.() ?? Date.now()
        const args = await signedLimiterArgs(deps, {
          operation: 'record',
          ...input,
          timestamp,
        })
        const result = await deps.recordFailure(args)
        return result.limited
      } catch (error) {
        if (statusCode(error) === 429) throw error
        throw deps.createError({
          statusCode: 503,
          statusMessage: 'MCP authentication temporarily unavailable',
        })
      }
    },
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

  const requestId = deps.requestId?.() ?? randomUUID()
  const limiter = await readFailureBudget(
    { clientIp: input.clientIp ?? null, credential: token, requestId },
    deps,
  )

  let exchanged: ExchangedMcpCredential | null
  try {
    exchanged = await deps.exchangeCredential(token)
  } catch (error) {
    if (statusCode(error) === 429) {
      throw deps.createError({
        statusCode: 429,
        statusMessage: 'Too many MCP authentication requests',
      })
    }
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  if (!exchanged) {
    const limited = await limiter.recordFailure()
    throw deps.createError({
      statusCode: limited ? 429 : 401,
      statusMessage: limited
        ? 'Too many invalid MCP authentication attempts'
        : 'Invalid MCP authentication token',
    })
  }

  let access: ResolvedMcpCredentialAccess | null
  try {
    access = await deps.resolveCredentialAccess(exchanged.apiKeyId, exchanged.caller)
  } catch {
    throw deps.createError({
      statusCode: 503,
      statusMessage: 'MCP authentication temporarily unavailable',
    })
  }

  if (
    !access ||
    access.apiKeyId !== exchanged.apiKeyId ||
    access.ownerUserId !== exchanged.ownerUserId
  ) {
    const limited = await limiter.recordFailure()
    throw deps.createError({
      statusCode: limited ? 429 : 401,
      statusMessage: limited
        ? 'Too many invalid MCP authentication attempts'
        : 'Invalid MCP credential settings',
    })
  }

  input.context.mcpAuth = {
    apiKeyId: exchanged.apiKeyId,
    authUserId: exchanged.ownerUserId,
    caller: exchanged.caller,
  }
}
