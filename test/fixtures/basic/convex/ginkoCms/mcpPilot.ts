import { createGinkoMcpHandler } from '@lupinum/ginko-cms-convex/mcp'

import { components, internal } from '../_generated/api.js'
import { httpAction, type ActionCtx } from '../_generated/server.js'

declare const process: { env: Record<string, string | undefined> }

const credentialIssuerPath = '/mcp-credentials/'
const mcpPath = '/mcp-pilot'

function siteUrl() {
  const raw = process.env.CONVEX_SITE_URL
  if (!raw) throw new Error('CONVEX_SITE_URL is required for the MCP pilot.')
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

export function createGinkoMcpPilotHandler(
  ctx: Pick<ActionCtx, 'meta' | 'runQuery' | 'runMutation'>,
  site: URL,
  publishImpactAppHtml?: string,
) {
  return createGinkoMcpHandler({
    issuer: new URL(credentialIssuerPath, site),
    resource: new URL(mcpPath, site),
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
        return await ctx.runQuery(internal.ginkoCms.mcpPilotOperations.getEntry, args)
      },
      async saveEntryDraft(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpPilotOperations.saveEntryDraft, args)
      },
      async previewPublish(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpPilotOperations.previewPublish, args)
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
  return await createGinkoMcpPilotHandler(ctx, siteUrl()).fetch(ctx, request)
})
