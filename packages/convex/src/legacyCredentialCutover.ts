import { v } from 'convex/values'

import { directInternalMutation } from './functions.js'

const LEGACY_CREDENTIAL_LIMIT = 10_000

/**
 * One-shot bridge-release cutover for the v0.1.3 mcpKeys table.
 *
 * No runtime authentication path reads this table. Deploy this bridge schema,
 * run the cutover, verify the receipt, then deploy the final schema that removes
 * both this function and the empty table.
 */
export const revokeAndDeleteLegacyMcpKeys = directInternalMutation({
  id: 'legacyCredentialCutover:revokeAndDeleteLegacyMcpKeys',
  args: {},
  returns: v.object({
    deletedCount: v.number(),
    activeCount: v.number(),
    revokedCount: v.number(),
    alreadyComplete: v.boolean(),
  }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('legacyCredentialCutovers')
      .withIndex('by_key', (query) => query.eq('key', 'mcpKeys-v0.1.3'))
      .unique()
    const keys = await ctx.db.query('mcpKeys').take(LEGACY_CREDENTIAL_LIMIT + 1)
    if (keys.length > LEGACY_CREDENTIAL_LIMIT) {
      throw new Error(`Legacy MCP credential cutover exceeds ${LEGACY_CREDENTIAL_LIMIT} rows.`)
    }
    if (existing) {
      if (keys.length > 0) {
        throw new Error('Legacy MCP credentials exist after the recorded cutover; stop deployment.')
      }
      return {
        deletedCount: existing.deletedCount,
        activeCount: existing.activeCount,
        revokedCount: existing.revokedCount,
        alreadyComplete: true,
      }
    }

    const activeCount = keys.filter((key) => key.status === 'active').length
    const revokedCount = keys.length - activeCount
    for (const key of keys) await ctx.db.delete(key._id)
    await ctx.db.insert('legacyCredentialCutovers', {
      key: 'mcpKeys-v0.1.3',
      deletedCount: keys.length,
      activeCount,
      revokedCount,
      performedAt: Date.now(),
    })
    return {
      deletedCount: keys.length,
      activeCount,
      revokedCount,
      alreadyComplete: false,
    }
  },
})
