import { mcpCredentialScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import type { CmsMemberAppIdentity } from './auth/appIdentity.js'
import { canRead } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import type { MutationCtx } from './lib/types.js'

const agentRunStatusValidator = v.union(
  v.literal('active'),
  v.literal('completed'),
  v.literal('revoked'),
  v.literal('failed'),
)
const agentRunValidator = v.object({
  _id: v.string(),
  credentialApiKeyId: v.string(),
  delegatedUserId: v.string(),
  scopeSnapshot: v.array(v.string()),
  taskName: v.string(),
  status: agentRunStatusValidator,
  createdBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  endedAt: v.union(v.number(), v.null()),
  lastWriteAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
})

type AgentRunDoc = Doc<'agentRuns'>
const MAX_AGENT_RUNS = 100
const DEFAULT_AGENT_RUN_TTL_MS = 4 * 60 * 60 * 1_000
const MAX_AGENT_RUN_TTL_MS = 24 * 60 * 60 * 1_000
const MAX_ACTIVE_AGENT_RUNS_PER_CREDENTIAL = 10
const MAX_TASK_NAME_LENGTH = 200

function serializeRun(run: AgentRunDoc) {
  return {
    _id: String(run._id),
    credentialApiKeyId: run.credentialApiKeyId,
    delegatedUserId: run.delegatedUserId,
    scopeSnapshot: run.scopeSnapshot,
    taskName: run.taskName,
    status: run.status,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    expiresAt: run.expiresAt ?? null,
    endedAt: run.endedAt ?? null,
    lastWriteAt: run.lastWriteAt ?? null,
    lastError: run.lastError ?? null,
  }
}

export async function getActiveAgentRunOrThrow(
  ctx: {
    db: {
      get: (id: Id<'agentRuns'>) => Promise<AgentRunDoc | null>
    }
  },
  runId: string,
  now: number,
) {
  const run = await ctx.db.get(runId as Id<'agentRuns'>)
  if (!run) {
    throwCmsError('AGENT_RUN_NOT_FOUND', 'Agent run not found.', { agentRunId: runId })
  }
  if (run.status !== 'active') {
    throwCmsError('AGENT_RUN_NOT_ACTIVE', 'Agent run is not active.', {
      agentRunId: runId,
      status: run.status,
    })
  }
  if (run.expiresAt !== undefined && run.expiresAt !== null && run.expiresAt <= now) {
    throwCmsError('AGENT_RUN_EXPIRED', 'Agent run has expired.', { agentRunId: runId })
  }
  return run
}

function assertRunBelongsToIdentity(run: AgentRunDoc, appIdentity: CmsMemberAppIdentity) {
  if (run.delegatedUserId !== appIdentity.userId) {
    throwCmsError('AGENT_RUN_FORBIDDEN', 'Agent run belongs to a different user.', {
      agentRunId: String(run._id),
    })
  }
  if (appIdentity.audit.origin !== 'mcp') {
    throwCmsError('AGENT_RUN_FORBIDDEN', 'Agent run requires its MCP credential.', {
      agentRunId: String(run._id),
    })
  }
  if (run.credentialApiKeyId !== appIdentity.audit.apiKeyId) {
    throwCmsError('AGENT_RUN_FORBIDDEN', 'Agent run belongs to a different MCP credential.', {
      agentRunId: String(run._id),
    })
  }
}

export async function getOwnActiveAgentRunOrThrow(
  ctx: {
    db: {
      get: (id: Id<'agentRuns'>) => Promise<AgentRunDoc | null>
    }
  },
  runId: string,
  appIdentity: CmsMemberAppIdentity,
  now: number,
) {
  const run = await getActiveAgentRunOrThrow(ctx, runId, now)
  assertRunBelongsToIdentity(run, appIdentity)
  return run
}

export async function getOwnAgentRunOrThrow(
  ctx: { db: { get: (id: Id<'agentRuns'>) => Promise<AgentRunDoc | null> } },
  runId: string,
  appIdentity: CmsMemberAppIdentity,
) {
  const run = await ctx.db.get(runId as Id<'agentRuns'>)
  if (!run) {
    throwCmsError('AGENT_RUN_NOT_FOUND', 'Agent run not found.', { agentRunId: runId })
  }
  assertRunBelongsToIdentity(run, appIdentity)
  return run
}

export async function recordOwnedAgentRunWrite(
  ctx: MutationCtx & {
    appIdentity: () => Promise<CmsMemberAppIdentity>
  },
  agentRunId: string,
  operationId: string,
) {
  const appIdentity = await ctx.appIdentity()
  const now = Date.now()
  const run = await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, now)
  await ctx.db.patch(run._id, {
    updatedAt: now,
    lastWriteAt: now,
  })
  const updated = await ctx.db.get(run._id)
  if (!updated) throw new Error('Agent run disappeared after write.')

  await logActivity(ctx, {
    kind: 'agentRun.write',
    summary: `Agent run "${run.taskName}" used ${operationId}`,
    appIdentityId: appIdentity.userId,
    detail: {
      agentRunId,
      operationId,
      credentialApiKeyId: run.credentialApiKeyId,
      callerApiKeyId: appIdentity.audit.origin === 'mcp' ? appIdentity.audit.apiKeyId : null,
    },
  })

  return serializeRun(updated)
}

export const startRun = callerMutation.protected({
  id: 'agentRuns:startRun',
  args: {
    taskName: v.string(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  guard: canRead,
  returns: agentRunValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    if (appIdentity.audit.origin !== 'mcp') {
      throwCmsError('MCP_CREDENTIAL_REQUIRED', 'Only MCP credentials can start agent runs.')
    }
    const credentialApiKeyId = appIdentity.audit.apiKeyId
    const taskName = args.taskName.trim()
    if (!taskName || taskName.length > MAX_TASK_NAME_LENGTH) {
      throwCmsError(
        'INVALID_AGENT_RUN_TASK',
        `Agent run task names must contain between 1 and ${MAX_TASK_NAME_LENGTH} characters.`,
      )
    }
    const requestedExpiry = args.expiresAt
    const expiresAt = requestedExpiry == null ? now + DEFAULT_AGENT_RUN_TTL_MS : requestedExpiry
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throwCmsError('INVALID_AGENT_RUN_EXPIRY', 'Agent run expiry must be in the future.')
    }
    if (expiresAt > now + MAX_AGENT_RUN_TTL_MS) {
      throwCmsError('INVALID_AGENT_RUN_EXPIRY', 'Agent runs cannot last longer than 24 hours.')
    }
    const activeRuns = await ctx.db
      .query('agentRuns')
      .withIndex('by_credential_status_expires_at', (q) =>
        q.eq('credentialApiKeyId', credentialApiKeyId).eq('status', 'active').gt('expiresAt', now),
      )
      .take(MAX_ACTIVE_AGENT_RUNS_PER_CREDENTIAL)
    if (activeRuns.length === MAX_ACTIVE_AGENT_RUNS_PER_CREDENTIAL) {
      throwCmsError(
        'AGENT_RUN_LIMIT_REACHED',
        `A credential can have at most ${MAX_ACTIVE_AGENT_RUNS_PER_CREDENTIAL} active agent runs.`,
      )
    }
    const scopeSnapshot = Object.entries(appIdentity.mcpEffectivePermissions ?? {})
      .filter(
        ([permission, enabled]) =>
          enabled &&
          mcpCredentialScopeKeys.includes(permission as (typeof mcpCredentialScopeKeys)[number]),
      )
      .map(([permission]) => permission)
      .sort()
    const id = await ctx.db.insert('agentRuns', {
      credentialApiKeyId,
      delegatedUserId: appIdentity.userId,
      scopeSnapshot,
      taskName,
      status: 'active',
      createdBy: appIdentity.userId,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      endedAt: null,
      lastWriteAt: null,
      lastError: null,
    })
    const run = await ctx.db.get(id)
    if (!run) throw new Error('Agent run disappeared after create.')

    await logActivity(ctx, {
      kind: 'agentRun.started',
      summary: `Started agent run "${taskName}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        agentRunId: String(id),
        credentialApiKeyId,
      },
    })

    return serializeRun(run)
  },
})

export const listOwnRuns = callerQuery.protected({
  id: 'agentRuns:listOwnRuns',
  args: {
    limit: v.optional(v.number()),
  },
  guard: canRead,
  returns: v.array(agentRunValidator),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const boundedLimit = Math.max(1, Math.min(MAX_AGENT_RUNS, args.limit ?? 50))
    const credentialApiKeyId =
      appIdentity.audit.origin === 'mcp' ? appIdentity.audit.apiKeyId : null
    const runs = credentialApiKeyId
      ? await ctx.db
          .query('agentRuns')
          .withIndex('by_credential', (q) => q.eq('credentialApiKeyId', credentialApiKeyId))
          .order('desc')
          .take(boundedLimit)
      : await ctx.db
          .query('agentRuns')
          .withIndex('by_delegated_user', (q) => q.eq('delegatedUserId', appIdentity.userId))
          .order('desc')
          .take(boundedLimit)

    return runs.map(serializeRun)
  },
})

export const completeRun = callerMutation.protected({
  id: 'agentRuns:completeRun',
  args: {
    agentRunId: v.string(),
  },
  guard: canRead,
  returns: agentRunValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const run = await getOwnActiveAgentRunOrThrow(ctx, args.agentRunId, appIdentity, now)
    await ctx.db.patch(run._id, {
      status: 'completed',
      updatedAt: now,
      endedAt: now,
    })
    const updated = await ctx.db.get(run._id)
    if (!updated) throw new Error('Agent run disappeared after complete.')

    await logActivity(ctx, {
      kind: 'agentRun.completed',
      summary: `Completed agent run "${run.taskName}"`,
      appIdentityId: appIdentity.userId,
      detail: { agentRunId: args.agentRunId },
    })

    return serializeRun(updated)
  },
})

export const revokeRun = callerMutation.protected({
  id: 'agentRuns:revokeRun',
  args: {
    agentRunId: v.string(),
  },
  guard: canRead,
  returns: agentRunValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const run = await getActiveAgentRunOrThrow(ctx, args.agentRunId, now)
    if (run.delegatedUserId !== appIdentity.userId) {
      throwCmsError('AGENT_RUN_FORBIDDEN', 'Agent run belongs to a different user.', {
        agentRunId: args.agentRunId,
      })
    }
    await ctx.db.patch(run._id, {
      status: 'revoked',
      updatedAt: now,
      endedAt: now,
    })
    const updated = await ctx.db.get(run._id)
    if (!updated) throw new Error('Agent run disappeared after revoke.')

    await logActivity(ctx, {
      kind: 'agentRun.revoked',
      summary: `Revoked agent run "${run.taskName}"`,
      appIdentityId: appIdentity.userId,
      detail: { agentRunId: args.agentRunId },
    })

    return serializeRun(updated)
  },
})

export const recordWrite = callerMutation.protected({
  id: 'agentRuns:recordWrite',
  args: {
    agentRunId: v.string(),
    operationId: v.string(),
  },
  guard: canRead,
  returns: agentRunValidator,
  handler: async (ctx, args) => {
    return await recordOwnedAgentRunWrite(ctx, args.agentRunId, args.operationId)
  },
})
