import { createGinkoMcpHandler as createMcpHandler } from '@lupinum/ginko-cms-convex/mcp'

import { components, internal } from '../_generated/api.js'
import { httpAction, type ActionCtx } from '../_generated/server.js'

declare const process: { env: Record<string, string | undefined> }

const credentialIssuerPath = '/mcp-credentials/'
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

export function createGinkoMcpHandler(
  ctx: Pick<ActionCtx, 'meta' | 'runQuery' | 'runMutation'>,
  site: URL,
  application: URL,
  publishImpactAppHtml?: string,
) {
  return createMcpHandler({
    issuer: new URL(credentialIssuerPath, site),
    resource: new URL(mcpPath, site),
    reviewInteractionBase: new URL(reviewInteractionPath, application),
    ...(publishImpactAppHtml === undefined ? {} : { publishImpactAppHtml }),
    operations: {
      async admitCredential(secretHash) {
        const metadata = await ctx.meta.getRequestMetadata()
        return await ctx.runMutation(components.ginkoCms.mcpCredentials.admitAccessBySecretHash, {
          secretHash,
          ipBucketKey: await admissionBucketKey('ip', metadata.ip ?? 'unknown'),
          credentialBucketKey: await admissionBucketKey('credential', secretHash),
          requestId: metadata.requestId,
        })
      },
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

async function admissionBucketKey(kind: 'credential' | 'ip', value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`ginko-mcp:${kind}:${value}`),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const handle = httpAction(async (ctx, request) => {
  return await createGinkoMcpHandler(ctx, siteUrl(), applicationUrl()).fetch(ctx, request)
})
