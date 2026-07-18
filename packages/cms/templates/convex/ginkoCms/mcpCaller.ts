import { cmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server.js'

declare const process: { env: Record<string, string | undefined> }

export const mcpCallerArgs = {
  _mcpServerSecret: v.optional(v.string()),
  _mcpCredentialHash: v.optional(v.string()),
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
  _mcpServerSecret?: string
  _mcpCredentialHash?: string
}

export function stripMcpCallerArgs<TArgs extends McpCallerArgs>(args: TArgs) {
  const {
    _mcpServerSecret: _serverSecret,
    _mcpCredentialHash: _credentialHash,
    ...domainArgs
  } = args
  return domainArgs
}

type McpHostCtx = Pick<QueryCtx | MutationCtx | ActionCtx, 'runQuery'>

export async function bindMcpCaller<TArgs extends McpCallerArgs>(ctx: McpHostCtx, args: TArgs) {
  const { _mcpServerSecret, _mcpCredentialHash, ...domainArgs } = args
  if (_mcpServerSecret === undefined && _mcpCredentialHash === undefined) return domainArgs

  const configuredSecret = requireMcpServerSecret()
  if (_mcpServerSecret !== configuredSecret || typeof _mcpCredentialHash !== 'string') {
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
