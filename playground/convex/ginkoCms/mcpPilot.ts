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
  ctx: Pick<ActionCtx, 'runQuery' | 'runMutation'>,
  site: URL,
) {
  return createGinkoMcpHandler({
    issuer: new URL(credentialIssuerPath, site),
    resource: new URL(mcpPath, site),
    operations: {
      async resolveCredential(secretHash) {
        return await ctx.runQuery(components.ginkoCms.mcpCredentials.resolveAccessBySecretHash, {
          secretHash,
        })
      },
      async getEntry(args) {
        return await ctx.runQuery(internal.ginkoCms.mcpPilotOperations.getEntry, args)
      },
      async saveEntryDraft(args) {
        return await ctx.runMutation(internal.ginkoCms.mcpPilotOperations.saveEntryDraft, args)
      },
    },
  })
}

export const handle = httpAction(async (ctx, request) => {
  return await createGinkoMcpPilotHandler(ctx, siteUrl()).fetch(ctx, request)
})
