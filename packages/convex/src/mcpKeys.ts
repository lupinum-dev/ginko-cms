import { createMcpKey, revokeMcpKey } from '@lupinum/ginko-cms-contract/convex/schemas/mcpKeys.js'
import { mcpKeyValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import { internalMutation } from './_generated/server.js'
import { canManageSettings } from './auth/checks.js'
import { callerMutation, callerQuery, unsafePermit, unsafeRaw } from './functions.js'
import { asMcpKeyId } from './lib/ids.js'

const TOUCH_DEBOUNCE_MS = 60_000
const MCP_KEY_DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000
const CONFIRMATION_CLEANUP_BATCH_SIZE = 100

export const list = callerQuery.protected({
  id: 'mcpKeys:list',
  guard: canManageSettings,
  args: {},
  returns: v.array(mcpKeyValidator),
  handler: async (ctx) => {
    const keys = await ctx.db.query('mcpKeys').order('desc').collect()

    return await Promise.all(
      keys.map(async (key) => {
        const member = await ctx.db
          .query('members')
          .withIndex('by_userId', (q) => q.eq('userId', key.boundUserId))
          .first()

        return {
          _id: key._id,
          _creationTime: key._creationTime,
          name: key.name,
          prefix: key.prefix,
          boundUserId: key.boundUserId,
          issuedBy: key.issuedBy,
          status: key.status,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt ?? key.createdAt,
          lastUsedAt: key.lastUsedAt ?? null,
          revokedAt: key.revokedAt ?? null,
          boundMember: member
            ? {
                userId: member.userId,
                displayName: member.displayName ?? null,
                email: member.email ?? null,
                role: member.role,
              }
            : null,
        }
      }),
    )
  },
})

export const create = callerMutation.protected({
  id: 'mcpKeys:create',
  guard: canManageSettings,
  args: createMcpKey.args,
  returns: v.string(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const boundMember = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', args.boundUserId))
      .first()

    if (!boundMember) {
      throw new Error('Bound user is not a CMS member.')
    }

    const existingKey = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()

    if (existingKey) {
      throw new Error('An MCP key with this hash already exists.')
    }

    const now = Date.now()
    return await ctx.db.insert('mcpKeys', {
      name: args.name,
      prefix: args.prefix,
      hash: args.hash,
      boundUserId: args.boundUserId,
      issuedBy: appIdentity!.userId,
      status: 'active',
      createdAt: now,
      expiresAt: now + MCP_KEY_DEFAULT_TTL_MS,
    })
  },
})

export const revoke = callerMutation.protected({
  id: 'mcpKeys:revoke',
  guard: canManageSettings,
  args: revokeMcpKey.args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = asMcpKeyId(args.id)
    const key = await ctx.db.get(id)
    if (!key) {
      throw new Error('MCP key not found.')
    }

    await ctx.db.patch(id, {
      status: 'revoked' as const,
      revokedAt: Date.now(),
    })
    return null
  },
})

export const consumeToken = unsafeRaw.mutation({
  permit: unsafePermit.permit({
    kind: 'mcpTokenLookup',
    reason: 'Consume MCP bearer tokens before the request resolves to a CMS appIdentity.',
    scope: ['mcpKeys'],
  }),
  args: {
    hash: v.string(),
    seenAt: v.number(),
    clientIp: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.union(
    v.null(),
    v.object({
      mcpKeyId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()

    if (!key || key.status !== 'active') return null
    if (typeof key.expiresAt !== 'number' || key.expiresAt <= args.seenAt) return null

    const member = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', key.boundUserId))
      .first()
    if (!member) return null

    const lastUsedAt = typeof key.lastUsedAt === 'number' ? key.lastUsedAt : 0
    if (args.seenAt - lastUsedAt >= TOUCH_DEBOUNCE_MS) {
      await ctx.db.patch(key._id, {
        lastUsedAt: args.seenAt,
      })
    }

    return {
      mcpKeyId: String(key._id),
    }
  },
})

export const cleanupExpiredConfirmations = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    remaining: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? CONFIRMATION_CLEANUP_BATCH_SIZE), 1),
      CONFIRMATION_CLEANUP_BATCH_SIZE,
    )
    const expired = await ctx.db
      .query('destructiveConfirmations')
      .withIndex('by_expires_at', (q) => q.lt('expiresAt', now))
      .take(limit)

    for (const row of expired) {
      await ctx.db.delete(row._id)
    }

    const remaining = expired.length === limit
    if (remaining) {
      await ctx.scheduler.runAfter(0, internal.mcpKeys.cleanupExpiredConfirmations, {
        now,
        limit,
      })
    }

    return {
      deleted: expired.length,
      remaining,
    }
  },
})
