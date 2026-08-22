import { createBetterAuthMcpAccessVerifier } from '@lupinum/better-convex-nuxt/better-auth/server'
import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { handleGinkoMcpRequest } from '@lupinum/ginko-cms-convex/mcp'

import { internal } from '../_generated/api.js'
import { httpAction } from '../_generated/server.js'
import { auth } from '../auth.js'

declare const process: { env: Record<string, string | undefined> }

const mcpPath = '/mcp'
const reviewInteractionPath = '/api/_ginko/reviews/'

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

export const handle = httpAction(async (ctx, request) => {
  const site = siteUrl()
  const application = applicationUrl()
  const issuer = `${application.origin}/api/auth`
  const resource = new URL(mcpPath, site)

  return await handleGinkoMcpRequest(request, {
    authorization: {
      issuer,
      verifier: createBetterAuthMcpAccessVerifier({
        allowedScopes: mcpDelegatedScopeKeys,
        jwksUrl: `${issuer}/jwks`,
        maxLifetimeSeconds: 600,
        validateLiveAccess: async (access) =>
          await auth.authComponent.validateOAuthAccess(ctx, access),
      }),
    },
    resource,
    reviewInteractionBase: new URL(reviewInteractionPath, application),
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
})
