import {
  inspectImportPublicationEntries as inspectImportPublicationEntriesArgs,
  listImportPublicationIdentities as listImportPublicationIdentitiesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { v } from 'convex/values'

import { canManagePortability } from '../auth/checks.js'
import { computePublishDraftHash } from '../entries/workflow/commands.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import { callerQuery } from '../functions.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { getImportRun } from './importModel.js'

const MIGRATION_PUBLICATION_PAGE_LIMIT = 100

async function requireCompletedCallerImport(
  ctx: QueryOrMutationCtx,
  args: { runId: string; payloadSha256: string },
  callerId: string,
) {
  const run = await getImportRun(ctx, args.runId)
  if (
    run.callerId !== callerId ||
    run.payloadSha256 !== args.payloadSha256 ||
    run.state !== 'complete'
  ) {
    throw new Error('Portable import is not complete for this caller and payload.')
  }
  return run
}

export function defineListImportPublicationIdentities() {
  return callerQuery.protected({
    id: 'portability:listImportPublicationIdentities',
    args: listImportPublicationIdentitiesArgs.args,
    guard: canManagePortability,
    returns: v.object({
      identities: v.array(
        v.object({
          entryId: v.string(),
          collection: v.string(),
          canonicalKey: v.string(),
          locale: v.string(),
        }),
      ),
      cursor: v.union(v.number(), v.null()),
    }),
    handler: async (ctx, args) => {
      if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) {
        throw new Error('Migration publication identity pages contain 1-100 rows.')
      }
      if (args.cursor !== null && (!Number.isSafeInteger(args.cursor) || args.cursor < 0)) {
        throw new Error('Migration publication identity cursor is invalid.')
      }
      const identity = await ctx.appIdentity()
      const run = await requireCompletedCallerImport(ctx, args, identity.userId)
      const indexed = ctx.db.query('portableItems').withIndex('by_run_index', (query) => {
        const scoped = query.eq('runId', run.runId)
        return args.cursor === null ? scoped : scoped.gt('index', args.cursor)
      })
      const fetched = await indexed.take(args.limit + 1)
      const items = fetched.slice(0, args.limit)
      const identities = items.map((item) => {
        if (item.mode !== 'import' || item.state !== 'committed' || !item.resultId) {
          throw new Error('Portable import item publication identity is incomplete.')
        }
        return {
          entryId: item.resultId,
          collection: item.collection,
          canonicalKey: item.canonicalKey,
          locale: item.locale,
        }
      })
      return {
        identities,
        cursor: fetched.length > args.limit && items.length > 0 ? items.at(-1)!.index : null,
      }
    },
  })
}

export function defineInspectImportPublicationEntries() {
  return callerQuery.protected({
    id: 'portability:inspectImportPublicationEntries',
    args: inspectImportPublicationEntriesArgs.args,
    guard: canManagePortability,
    returns: v.object({
      entries: v.array(
        v.object({
          entryId: v.string(),
          locales: v.array(v.string()),
          pendingLocales: v.array(v.string()),
          expectedVersion: v.number(),
          draftSha256: v.string(),
        }),
      ),
    }),
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await requireCompletedCallerImport(ctx, args, identity.userId)
      if (args.entries.length < 1 || args.entries.length > MIGRATION_PUBLICATION_PAGE_LIMIT) {
        throw new Error(
          `Migration publication inspection pages contain 1-${MIGRATION_PUBLICATION_PAGE_LIMIT} entries.`,
        )
      }
      const seen = new Set<string>()
      const entries = []
      for (const requested of args.entries) {
        if (seen.has(requested.entryId))
          throw new Error('Migration publication page has duplicates.')
        seen.add(requested.entryId)
        const locales = [...new Set(requested.locales)].sort()
        if (locales.length === 0 || locales.length !== requested.locales.length) {
          throw new Error('Migration publication entry locales are invalid.')
        }
        for (const locale of locales) {
          const item = await ctx.db
            .query('portableItems')
            .withIndex('by_run_identity', (query) =>
              query
                .eq('runId', run.runId)
                .eq('collection', requested.collection)
                .eq('canonicalKey', requested.canonicalKey)
                .eq('locale', locale),
            )
            .unique()
          if (
            !item ||
            item.mode !== 'import' ||
            item.state !== 'committed' ||
            item.resultId !== requested.entryId
          ) {
            throw new Error('Migration publication identity does not belong to this import.')
          }
        }
        const normalized = ctx.db.normalizeId('entries', requested.entryId)
        const entry = normalized ? await ctx.db.get(normalized) : null
        if (!entry) throw new Error('Portable import entry no longer exists.')
        const drafts = await readDraftRows(ctx, entry._id)
        const pendingLocales = locales.filter((locale) => {
          const draft = drafts.byLocale[locale]
          const publication = entry.activePublications.find((value) => value.locale === locale)
          return (
            !draft ||
            !publication ||
            publication.sharedVersion !== entry.sharedVersion ||
            publication.localeVersion !== draft.version
          )
        })
        entries.push({
          entryId: requested.entryId,
          locales,
          pendingLocales,
          expectedVersion: entry.draftVersion,
          draftSha256: await computePublishDraftHash(ctx, { entryId: entry._id, locales }),
        })
      }
      return { entries }
    },
  })
}
