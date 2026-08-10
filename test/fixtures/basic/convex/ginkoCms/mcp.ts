import { createGinkoMcpHandler as createMcpHandler } from '@lupinum/ginko-cms-convex/mcp'
import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { createBetterAuthMcpAccessVerifier } from 'better-convex-nuxt/convex-auth'

import { components, internal } from '../_generated/api.js'
import { httpAction, type ActionCtx } from '../_generated/server.js'

declare const process: { env: Record<string, string | undefined> }

const mcpPath = '/mcp'
const reviewInteractionPath = '/api/_ginko/reviews/'
const mcpScopes = mcpDelegatedScopeKeys

function siteUrl() {
  const raw = process.env.CONVEX_SITE_URL
  if (!raw) throw new Error('CONVEX_SITE_URL is required for MCP.')
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('CONVEX_SITE_URL must be a canonical HTTPS origin.')
  }
  return new URL(url.origin)
}

function applicationUrl() {
  const raw = process.env.SITE_URL
  if (!raw) throw new Error('SITE_URL is required for MCP review interactions.')
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SITE_URL must be a canonical HTTPS origin.')
  }
  return new URL(url.origin)
}

export function createGinkoMcpHandler(
  ctx: Pick<ActionCtx, 'meta' | 'runQuery' | 'runMutation'>,
  site: URL,
  application: URL,
  publishImpactAppHtml?: string,
) {
  const issuer = `${application.origin}/api/auth`
  const resource = new URL(mcpPath, site)
  return createMcpHandler({
    authorizationIssuer: issuer,
    resource,
    reviewInteractionBase: new URL(reviewInteractionPath, application),
    ...(publishImpactAppHtml === undefined ? {} : { publishImpactAppHtml }),
    verifier: createBetterAuthMcpAccessVerifier({
      allowedScopes: mcpScopes,
      issuer,
      jwksUrl: `${issuer}/jwks`,
      maxLifetimeSeconds: 600,
      validateLiveAccess: async (access) => await validateLiveProviderAccess(ctx, access),
    }),
    operations: {
      async getEntry(args) {
        return await ctx.runQuery(internal.ginkoCms.mcpOperations.getEntry, args)
      },
      async startAgentRun(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpOperations.startAgentRun, args)
      },
      async completeAgentRun(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpOperations.completeAgentRun, args)
      },
      async saveEntryDraft(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpOperations.saveEntryDraft, args)
      },
      async previewPublish(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpOperations.previewPublish, args)
      },
      async requestPublishReview(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpOperations.requestPublishReview, args)
      },
      async getReviewStatus(args) {
        return await ctx.runQuery(internal.ginkoCms.mcpOperations.getReviewStatus, args)
      },
    },
  })
}

async function authRecord(
  ctx: Pick<ActionCtx, 'runQuery'>,
  model: string,
  where: Array<{ field: string; value: string }>,
): Promise<Record<string, unknown> | null> {
  return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model,
    where,
  })) as Record<string, unknown> | null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : []
}

export async function validateLiveProviderAccess(
  ctx: Pick<ActionCtx, 'runQuery'>,
  access: {
    clientId: string
    resource: string
    scopes: readonly string[]
    sessionId: string
    subject: string
  },
): Promise<boolean> {
  const [session, user, client, resource, clientResource, consent] = await Promise.all([
    authRecord(ctx, 'session', [
      { field: 'id', value: access.sessionId },
      { field: 'userId', value: access.subject },
    ]),
    authRecord(ctx, 'user', [{ field: 'id', value: access.subject }]),
    authRecord(ctx, 'oauthClient', [{ field: 'clientId', value: access.clientId }]),
    authRecord(ctx, 'oauthResource', [{ field: 'identifier', value: access.resource }]),
    authRecord(ctx, 'oauthClientResource', [
      { field: 'clientId', value: access.clientId },
      { field: 'resourceId', value: access.resource },
    ]),
    authRecord(ctx, 'oauthConsent', [
      { field: 'clientId', value: access.clientId },
      { field: 'userId', value: access.subject },
    ]),
  ])
  if (
    !session ||
    session.id !== access.sessionId ||
    session.userId !== access.subject ||
    typeof session.expiresAt !== 'number' ||
    session.expiresAt <= Date.now() ||
    !user ||
    user.id !== access.subject ||
    !client ||
    client.clientId !== access.clientId ||
    client.disabled === true ||
    client.requirePKCE !== true ||
    !strings(client.grantTypes).includes('authorization_code') ||
    !strings(client.responseTypes).includes('code') ||
    !resource ||
    resource.identifier !== access.resource ||
    resource.disabled === true ||
    resource.signingAlgorithm !== 'RS256' ||
    !clientResource ||
    clientResource.clientId !== access.clientId ||
    clientResource.resourceId !== access.resource ||
    !consent ||
    consent.clientId !== access.clientId ||
    consent.userId !== access.subject ||
    !strings(consent.resources).includes(access.resource)
  ) {
    return false
  }
  const clientScopes = new Set(strings(client.scopes))
  const resourceScopes = new Set(strings(resource.allowedScopes))
  const consentScopes = new Set(strings(consent.scopes))
  return access.scopes.every(
    (scope) =>
      mcpScopes.includes(scope as (typeof mcpScopes)[number]) &&
      clientScopes.has(scope) &&
      resourceScopes.has(scope) &&
      consentScopes.has(scope),
  )
}

export const handle = httpAction(async (ctx, request) => {
  return await createGinkoMcpHandler(ctx, siteUrl(), applicationUrl()).fetch(ctx, request)
})
