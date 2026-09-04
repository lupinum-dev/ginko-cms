import { internal } from '../_generated/api.js'
import type { Id } from '../_generated/dataModel.js'
import type { CmsMemberAppIdentity } from '../auth/appIdentity.js'
import { toStringId } from '../lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'

declare const process: { env: Record<string, string | undefined> }

const LOCAL_REVALIDATION_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
])
const REVALIDATION_ALLOWED_HOSTS_ENV = 'GINKO_CMS_REVALIDATION_ALLOWED_HOSTS'

type TargetEnvironment = 'production' | 'preview' | 'development'
type TargetMutationCtx = MutationCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null
}

function isPrivateOrReservedIpv4(address: string) {
  const octets = ipv4Octets(address)
  if (!octets) return false
  const [a, b, c] = octets as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  return a >= 224
}

function isPrivateOrReservedHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (
    LOCAL_REVALIDATION_HOSTS.has(normalized) ||
    normalized === '0' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true
  }
  if (isPrivateOrReservedIpv4(normalized)) return true
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('100:') ||
    normalized.startsWith('2001:db8:')
  )
}

function localRevalidationAllowed() {
  return process.env.GINKO_CMS_ALLOW_LOCAL_REVALIDATION === '1'
}

function allowedRevalidationHosts(): Set<string> {
  return new Set(
    (process.env[REVALIDATION_ALLOWED_HOSTS_ENV] ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function assertValidTargetEndpoint(endpoint: string) {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error('REVALIDATION_ENDPOINT_INVALID')
  }

  if (parsed.username || parsed.password) {
    throw new Error('REVALIDATION_ENDPOINT_CREDENTIALS_FORBIDDEN')
  }

  const privateOrReserved = isPrivateOrReservedHost(parsed.hostname)
  if (privateOrReserved && !localRevalidationAllowed()) {
    throw new Error('REVALIDATION_ENDPOINT_PUBLIC_HTTPS_REQUIRED')
  }
  if (parsed.protocol !== 'https:' && !(privateOrReserved && localRevalidationAllowed())) {
    throw new Error('REVALIDATION_ENDPOINT_HTTPS_REQUIRED')
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (!privateOrReserved && !allowedRevalidationHosts().has(hostname)) {
    throw new Error('REVALIDATION_ENDPOINT_HOST_NOT_ALLOWED')
  }
}

export async function getEnabledTarget(
  ctx: QueryOrMutationCtx,
  targetId?: Id<'revalidationTargets'> | null,
) {
  if (targetId) {
    const target = await ctx.db.get(targetId)
    return target?.enabled ? target : null
  }

  return await ctx.db
    .query('revalidationTargets')
    .withIndex('by_enabled_environment', (query) =>
      query.eq('enabled', true).eq('environment', 'production'),
    )
    .first()
}

export async function scheduleRevalidationDelivery(ctx: MutationCtx) {
  if (!(await getEnabledTarget(ctx))) return
  await ctx.scheduler.runAfter(1, internal.revalidation.deliverDue, {})
}

export async function scheduleNextRevalidationDeliveryHandler(
  ctx: MutationCtx,
  args: { now: number },
) {
  if (!(await getEnabledTarget(ctx))) return null
  const next = await ctx.db
    .query('outboxEvents')
    .withIndex('by_status_nextAttemptAt', (query) => query.eq('status', 'pending'))
    .order('asc')
    .first()
  if (!next) return null
  await ctx.scheduler.runAt(
    Math.max(next.nextAttemptAt, args.now + 1),
    internal.revalidation.deliverDue,
    {},
  )
  return null
}

export async function upsertRevalidationTargetHandler(
  ctx: TargetMutationCtx,
  args: {
    targetId?: string
    name: string
    environment: TargetEnvironment
    endpoint: string
    secretEnv: string
    enabled: boolean
  },
) {
  assertValidTargetEndpoint(args.endpoint)
  if (!args.name.trim()) throw new Error('REVALIDATION_TARGET_NAME_REQUIRED')
  if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(args.secretEnv.trim())) {
    throw new Error('REVALIDATION_SECRET_ENV_INVALID')
  }
  if (args.enabled) {
    const enabledTarget = await ctx.db
      .query('revalidationTargets')
      .withIndex('by_enabled_environment', (query) =>
        query.eq('enabled', true).eq('environment', args.environment),
      )
      .first()
    if (enabledTarget && String(enabledTarget._id) !== args.targetId) {
      throw new Error(
        `REVALIDATION_TARGET_ALREADY_ENABLED_FOR_ENVIRONMENT: Disable the existing ${args.environment} target before enabling another one.`,
      )
    }
  }
  const appIdentity = await ctx.appIdentity()
  const now = Date.now()
  const patch = {
    name: args.name.trim(),
    environment: args.environment,
    endpoint: args.endpoint,
    secretEnv: args.secretEnv.trim(),
    enabled: args.enabled,
    updatedBy: appIdentity.userId,
    updatedAt: now,
  }

  if (args.targetId) {
    const targetId = ctx.db.normalizeId('revalidationTargets', args.targetId)
    if (!targetId || !(await ctx.db.get(targetId))) {
      throw new Error('REVALIDATION_TARGET_NOT_FOUND')
    }
    await ctx.db.patch(targetId, patch)
    if (args.enabled) await scheduleRevalidationDelivery(ctx)
    return args.targetId
  }

  const targetId = await ctx.db.insert('revalidationTargets', {
    ...patch,
    createdBy: appIdentity.userId,
    createdAt: now,
  })
  if (args.enabled) await scheduleRevalidationDelivery(ctx)
  return toStringId(targetId)
}

export async function listRevalidationTargetsHandler(ctx: QueryOrMutationCtx) {
  const targets = await ctx.db.query('revalidationTargets').collect()
  return targets.map((target) => ({
    id: toStringId(target._id),
    name: target.name,
    environment: target.environment,
    endpoint: target.endpoint,
    secretEnv: target.secretEnv,
    enabled: target.enabled,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  }))
}

export async function listRevalidationJobsHandler(
  ctx: QueryOrMutationCtx,
  args: {
    status?: 'pending' | 'delivering' | 'delivered' | 'failed'
    limit?: number
  },
) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
  const internalStatus = args.status === 'failed' ? 'dead' : args.status
  const rows = internalStatus
    ? await ctx.db
        .query('outboxEvents')
        .withIndex('by_status_nextAttemptAt', (query) => query.eq('status', internalStatus))
        .take(limit)
    : await ctx.db.query('outboxEvents').take(limit)

  return rows.map((row) => ({
    id: toStringId(row._id),
    status: row.status === 'dead' ? ('failed' as const) : row.status,
    tags: row.tags,
    paths: row.paths,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    deliveredAt: row.deliveredAt ?? null,
    payload: row.payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}
