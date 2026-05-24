import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { refreshDraftAssetRefsForSave } from './entries/workflow/commands.js'
import { readDraftRows, applyDraftPatch, type SaveDraftPatch } from './entries/workflow/drafts.js'
import { throwCmsError } from './errors.js'
import { unsafePermit, unsafeRaw } from './functions.js'
import { getCollectionOrThrow } from './lib/collections.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'

const MIGRATION_PAGE_SIZE_DEFAULT = 100
const MIGRATION_PAGE_SIZE_MAX = 250
const MIGRATION_APP_IDENTITY = 'ginko-cms-cli:migration'

const contentMigrationLocaleValidator = v.union(
  v.object({
    values: jsonObjectValidator,
    bodyMdc: v.optional(v.union(v.string(), v.null())),
  }),
  v.null(),
)

const contentMigrationEntryValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  stableId: v.union(v.string(), v.null()),
  draftVersion: v.number(),
  shared: jsonObjectValidator,
  locales: v.record(v.string(), contentMigrationLocaleValidator),
})

function pageSize(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? MIGRATION_PAGE_SIZE_DEFAULT, MIGRATION_PAGE_SIZE_MAX))
}

async function contentMigrationEntrySnapshot(
  ctx: QueryOrMutationCtx,
  collection: Doc<'collections'>,
  entry: Doc<'entries'>,
) {
  const drafts = await readDraftRows(ctx, entry._id)
  const locales: Record<string, { values: JsonObject; bodyMdc?: string | null } | null> = {}

  for (const locale of collection.locales) {
    const row = drafts.byLocale[locale] ?? null
    locales[locale] = row
      ? {
          values: (row.values ?? {}) as JsonObject,
          ...(row.bodyMdc !== undefined ? { bodyMdc: row.bodyMdc ?? null } : {}),
        }
      : null
  }

  return {
    collection: collection.slug,
    entryId: toStringId(entry._id),
    stableId: entry.stableId ?? null,
    draftVersion: entry.draftVersion,
    shared: (drafts.shared?.shared ?? {}) as JsonObject,
    locales,
  }
}

function asEntryId(ctx: MutationCtx, value: string): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', value)
  if (!entryId) {
    throwCmsError('CONTENT_MIGRATION_ENTRY_INVALID', `Invalid entry id "${value}".`, {
      entryId: value,
    })
  }
  return entryId
}

function migrationPatch(input: {
  shared: JsonObject
  locales: Record<string, { values: JsonObject; bodyMdc?: string | null } | null>
}): SaveDraftPatch {
  const locales: SaveDraftPatch['locales'] = {}
  for (const [locale, value] of Object.entries(input.locales)) {
    if (!value) continue
    locales[locale] = {
      values: value.values,
      ...(value.bodyMdc !== undefined ? { bodyMdc: value.bodyMdc } : {}),
    }
  }

  return {
    shared: { shared: input.shared },
    locales,
  }
}

export const listContentMigrationEntriesInternal = unsafeRaw.query({
  identityForwardingFunctionRef: 'migrations:listContentMigrationEntriesInternal',
  permit: unsafePermit.permit({
    kind: 'componentContentMigrationRead',
    reason:
      'Host app generated bridge uses Convex deploy-key admin auth to read draft snapshots for explicit project content migrations.',
    scope: ['entries', 'entryDrafts', 'collections'],
  }),
  args: {
    collection: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(contentMigrationEntryValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const entries = await ctx.db
      .query('entries')
      .withIndex('by_collection_status', (q) => q.eq('collectionId', collection._id))
      .collect()
    const limit = pageSize(args.limit)
    const cursorIndex =
      args.cursor === null
        ? null
        : entries.findIndex((entry) => toStringId(entry._id) === args.cursor)
    const startIndex = cursorIndex === null ? 0 : cursorIndex + 1

    if (cursorIndex !== null && cursorIndex < 0) {
      throwCmsError('CONTENT_MIGRATION_CURSOR_INVALID', 'Migration cursor is no longer valid.', {
        collection: collection.slug,
        cursor: args.cursor,
      })
    }

    const slice = entries.slice(startIndex, startIndex + limit)
    const isDone = startIndex + slice.length >= entries.length

    return {
      page: await Promise.all(
        slice.map((entry) => contentMigrationEntrySnapshot(ctx, collection, entry)),
      ),
      isDone,
      continueCursor: isDone ? null : toStringId(slice.at(-1)!._id),
    }
  },
})

export const applyContentMigrationEntriesInternal = unsafeRaw.mutation({
  identityForwardingFunctionRef: 'migrations:applyContentMigrationEntriesInternal',
  permit: unsafePermit.permit({
    kind: 'componentContentMigrationApply',
    reason:
      'Host app generated bridge uses Convex deploy-key admin auth to apply explicit project content migrations.',
    scope: ['entries', 'entryDrafts', 'collections', 'contentAssetRefs'],
  }),
  args: {
    migrationId: v.string(),
    entries: v.array(contentMigrationEntryValidator),
  },
  returns: v.object({
    migrationId: v.string(),
    changed: v.number(),
    unchanged: v.number(),
  }),
  handler: async (ctx, args) => {
    let changed = 0
    let unchanged = 0
    const now = Date.now()

    for (const input of args.entries) {
      const entryId = asEntryId(ctx, input.entryId)
      const entry = await ctx.db.get(entryId)
      if (!entry) {
        throwCmsError('CONTENT_MIGRATION_ENTRY_NOT_FOUND', 'Migration entry no longer exists.', {
          entryId: input.entryId,
        })
      }

      const collection = await ctx.db.get(entry.collectionId)
      if (!collection || collection.slug !== input.collection) {
        throwCmsError(
          'CONTENT_MIGRATION_COLLECTION_MISMATCH',
          'Migration entry no longer belongs to the expected collection.',
          {
            entryId: input.entryId,
            expectedCollection: input.collection,
            actualCollection: collection?.slug ?? null,
          },
        )
      }

      const supportedLocales = new Set(collection.locales)
      for (const locale of Object.keys(input.locales)) {
        if (!supportedLocales.has(locale)) {
          throwCmsError(
            'CONTENT_MIGRATION_LOCALE_UNSUPPORTED',
            'Migration locale is not supported.',
            {
              entryId: input.entryId,
              collection: input.collection,
              locale,
            },
          )
        }
      }

      const result = await applyDraftPatch(ctx, {
        entryId,
        expectedDraftVersion: input.draftVersion,
        patch: migrationPatch(input),
        appIdentity: MIGRATION_APP_IDENTITY,
        now,
      })

      if (result.sharedUpdated || result.affectedLocales.length > 0) {
        changed += 1
        await refreshDraftAssetRefsForSave(ctx, {
          entryId,
          collectionId: result.entry.collectionId,
          sharedUpdated: result.sharedUpdated,
          affectedLocales: result.affectedLocales,
          now,
        })
      } else {
        unchanged += 1
      }
    }

    return {
      migrationId: args.migrationId,
      changed,
      unchanged,
    }
  },
})
