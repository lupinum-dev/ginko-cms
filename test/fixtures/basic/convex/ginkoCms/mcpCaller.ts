import {
  cmsCallerFromActionAuthIdentity,
  cmsMcpCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import { assertMcpCallerSignedRequest } from '@lupinum/ginko-cms-convex/mcp-limiter-protocol'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server.js'

declare const process: { env: Record<string, string | undefined> }

export const mcpCallerArgs = {
  _mcpCredentialHash: v.optional(v.string()),
  _mcpRequestId: v.optional(v.string()),
  _mcpTimestamp: v.optional(v.number()),
  _mcpSignature: v.optional(v.string()),
}

export function requireMcpServerSecret() {
  const secret = process.env.GINKO_CMS_MCP_SERVER_SECRET
  if (!secret || secret.length < 32 || secret.trim() !== secret) {
    throw new Error(
      'GINKO_CMS_MCP_SERVER_SECRET must be at least 32 characters with no surrounding whitespace.',
    )
  }
  return secret
}

type McpCallerArgs = {
  _mcpCredentialHash?: string
  _mcpRequestId?: string
  _mcpTimestamp?: number
  _mcpSignature?: string
}

export function stripMcpCallerArgs<TArgs extends McpCallerArgs>(args: TArgs) {
  const {
    _mcpCredentialHash: _credentialHash,
    _mcpRequestId: _requestId,
    _mcpTimestamp: _timestamp,
    _mcpSignature: _signature,
    ...domainArgs
  } = args
  return domainArgs
}

type CmsCallerHostCtx = Pick<QueryCtx | MutationCtx | ActionCtx, 'auth' | 'runQuery'>

export async function bindCmsCaller<TArgs extends Record<string, unknown>>(
  ctx: CmsCallerHostCtx,
  args: TArgs,
  operation?: string,
) {
  const { _mcpCredentialHash, _mcpRequestId, _mcpTimestamp, _mcpSignature, ...domainArgs } =
    args as TArgs & McpCallerArgs
  if (
    _mcpCredentialHash === undefined &&
    _mcpRequestId === undefined &&
    _mcpTimestamp === undefined &&
    _mcpSignature === undefined
  ) {
    const caller = cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity())
    return caller ? { ...domainArgs, _trustedCaller: caller } : domainArgs
  }

  if (!operation) {
    throw new ConvexError({ code: 'MCP_AUTH_INVALID', message: 'MCP authentication failed.' })
  }
  const configuredSecret = requireMcpServerSecret()
  if (
    typeof _mcpCredentialHash !== 'string' ||
    typeof _mcpRequestId !== 'string' ||
    typeof _mcpTimestamp !== 'number' ||
    typeof _mcpSignature !== 'string'
  ) {
    throw new ConvexError({ code: 'MCP_AUTH_INVALID', message: 'MCP authentication failed.' })
  }
  try {
    await assertMcpCallerSignedRequest(configuredSecret, operation, {
      credentialHash: _mcpCredentialHash,
      requestId: _mcpRequestId,
      timestamp: _mcpTimestamp,
      signature: _mcpSignature,
    })
  } catch {
    throw new ConvexError({ code: 'MCP_AUTH_INVALID', message: 'MCP authentication failed.' })
  }

  const access = await ctx.runQuery(components.ginkoCms.mcpCredentials.resolveAccessBySecretHash, {
    secretHash: _mcpCredentialHash,
  })
  if (!access) {
    throw new ConvexError({ code: 'MCP_AUTH_INVALID', message: 'MCP authentication failed.' })
  }
  return { ...domainArgs, _trustedCaller: cmsMcpCaller(access.apiKeyId) }
}

export const bindMcpCaller = bindCmsCaller
