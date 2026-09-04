import { listInstalledCollections } from '../lib/collections.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import type { ActivityDoc, HandlerQueryCtx } from '../lib/types.js'

async function resolveActivityDisplayFields(ctx: HandlerQueryCtx, page: ActivityDoc[]) {
  const collectionSlugs = new Set<string>()
  const entryIds = new Set<string>()
  for (const row of page) {
    if (row.collection) collectionSlugs.add(row.collection)
    if (row.entryId) entryIds.add(String(row.entryId))
  }

  const collections = new Map<string, { slug: string; label: string | null }>()
  const entries = new Map<string, string>()
  for (const collection of await listInstalledCollections(ctx)) {
    if (!collectionSlugs.has(collection.slug)) continue
    const label =
      typeof collection.label === 'string'
        ? collection.label
        : (Object.values(collection.label).find(Boolean) ?? null)
    collections.set(collection.slug, { slug: collection.slug, label })
  }
  await Promise.all(
    Array.from(entryIds, async (id) => {
      const entryId = ctx.db.normalizeId('entries', id)
      if (!entryId) return
      const doc = await ctx.db.get(entryId)
      if (doc) entries.set(id, doc.slug)
    }),
  )
  return { collections, entries }
}

function redactQuotedIdentifier(summary: string): string {
  return summary
    .replace(/\s+for\s+"[^"]+"/g, '')
    .replace(/\s*"[^"]+"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function displayActivitySummary(row: Pick<ActivityDoc, 'kind' | 'summary' | 'detail'>) {
  if (row.kind.startsWith('member.')) return redactQuotedIdentifier(row.summary)
  if (row.kind.startsWith('mcpOAuthDelegation.')) {
    return redactQuotedIdentifier(
      row.summary.replace(/MCP OAuth delegation/g, 'AI agent connection'),
    )
  }
  if (row.kind === 'entry.checkpointed') return row.summary.replace(/checkpoint/gi, 'version')
  return row.summary
}

export async function presentActivityRows(ctx: HandlerQueryCtx, page: ActivityDoc[]) {
  const display = await resolveActivityDisplayFields(ctx, page)
  return page.map((row) => ({
    _id: toStringId(row._id),
    kind: row.kind,
    outcome: row.outcome,
    displaySummary: displayActivitySummary(row),
    entryId: toOptionalStringId(row.entryId),
    collection: row.collection ?? null,
    locale: row.locale ?? null,
    appIdentityId: row.appIdentityId,
    createdAt: row.createdAt,
    collectionLabel: row.collection
      ? (display.collections.get(row.collection)?.label ?? null)
      : null,
    entrySlug: row.entryId ? (display.entries.get(String(row.entryId)) ?? null) : null,
    actorLabel: row.actorLabel,
  }))
}

export function presentEntryActivityRows(page: ActivityDoc[]) {
  return page.map((row) => ({
    _id: toStringId(row._id),
    kind: row.kind,
    outcome: row.outcome,
    summary: row.summary,
    displaySummary: displayActivitySummary(row),
    locale: row.locale ?? null,
    detail: row.detail ?? null,
    appIdentityId: row.appIdentityId,
    createdAt: row.createdAt,
  }))
}
