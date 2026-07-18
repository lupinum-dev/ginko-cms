import { createHash } from 'node:crypto'

import { serverConvex } from 'better-convex-nuxt/server'
import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'

import { api } from '#convex/api'

import {
  authenticateMcpRequestContext,
  type ExchangedMcpCredential,
} from '../mcp/_shared/request-auth'

export default defineEventHandler(async (event) => {
  // Global middleware: everything below (site-origin resolution, secret check)
  // must only ever run for MCP requests, or a missing MCP setup 503s the whole
  // host app. The downstream path guard in request-auth runs too late for that.
  if (!event.path?.startsWith('/mcp')) return
  await authenticateMcpRequest(event)
})

export async function authenticateMcpRequest(event: H3Event) {
  const mcpServerSecret = process.env.GINKO_CMS_MCP_SERVER_SECRET
  if (
    !mcpServerSecret ||
    mcpServerSecret.length < 32 ||
    mcpServerSecret.trim() !== mcpServerSecret
  ) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'GINKO_CMS_MCP_SERVER_SECRET must be at least 32 characters with no surrounding whitespace.',
    })
  }
  const limiterCaller = serverConvex(event, { auth: 'none' })
  await authenticateMcpRequestContext(
    {
      path: event.path,
      authorizationHeader: getRequestHeader(event, 'authorization'),
      clientIp: resolveMcpClientIp(event),
      context: event.context as Record<string, unknown>,
    },
    {
      createError: (input) =>
        Object.assign(createError(input), {
          statusCode: input.statusCode,
          statusMessage: input.statusMessage,
        }),
      limiterSecret: mcpServerSecret,
      checkFailureBudget: async (args) =>
        await limiterCaller.query(api.ginkoCms.mcpCredentials.checkFailureBudget, args),
      recordFailure: async (args) =>
        await limiterCaller.mutation(api.ginkoCms.mcpCredentials.recordFailure, args),
      authenticateCredential: (credential) =>
        authenticateMcpCredential(event, mcpServerSecret, credential),
    },
  )
}

/**
 * Resolve a CMS-owned service credential by hash, then return an anonymous
 * Convex caller that attaches the private server assertion to every call. Host
 * facades validate that assertion and the component re-checks credential,
 * membership, role, expiry, and scopes on every protected operation.
 */
async function authenticateMcpCredential(
  event: H3Event,
  serverSecret: string,
  credential: string,
): Promise<ExchangedMcpCredential | null> {
  const secretHash = createHash('sha256').update(credential).digest('hex')
  const caller = serverConvex(event, { auth: 'none' })
  const access = await caller.query(api.ginkoCms.mcpCredentials.resolveAccessBySecretHash, {
    serverSecret,
    secretHash,
  })
  if (!access) return null
  const assertion = { _mcpServerSecret: serverSecret, _mcpCredentialHash: secretHash }
  const assertedCaller: ExchangedMcpCredential['caller'] = {
    query: async (reference, args) => await caller.query(reference, { ...args, ...assertion }),
    mutation: async (reference, args) =>
      await caller.mutation(reference, { ...args, ...assertion }),
    action: async (reference, args) => await caller.action(reference, { ...args, ...assertion }),
  }
  return {
    apiKeyId: access.apiKeyId,
    ownerUserId: access.ownerUserId,
    caller: assertedCaller,
  }
}

export function resolveMcpClientIp(event: H3Event): string | null {
  return getRequestIP(event) ?? null
}
