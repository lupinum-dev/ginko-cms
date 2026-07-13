// @ts-nocheck - Temporary v0.1.3 bridge wrapper. Delete this host file after
// the cutover receipt is recorded and before deploying the final v0.2 schema.
import { components } from '../_generated/api.js'
import { internalMutation } from '../_generated/server.js'

export const revokeAndDeleteLegacyMcpKeys = internalMutation({
  args: {},
  handler: async (ctx) =>
    await ctx.runMutation(
      components.ginkoCms.legacyCredentialCutover.revokeAndDeleteLegacyMcpKeys,
      {},
    ),
})
