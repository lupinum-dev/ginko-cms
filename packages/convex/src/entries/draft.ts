import {
  createLocaleVariant as createLocaleVariantArgs,
  revertDraftToPublished as revertDraftToPublishedArgs,
  saveEntryDraft as saveEntryDraftArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { draftSaveResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import { recordOwnedAgentRunWrite } from '../agentRuns.js'
import { canCreateEntries, canEditEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { isLocalizedSlugMode } from '../lib/collections.js'
import { asEntryId } from '../lib/ids.js'
import type { MutationCtx } from '../lib/types.js'
import { assertValidLocaleCode } from '../lib/validation.js'
import {
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from '../operationHelpers.js'
import { loadEntryMutationContext, readStudioDraftView } from './context.js'
import { getDraftVsPublishedDiffPreview } from './read.js'
import { rewriteStoredRelationData } from './relations.js'
import { refreshDraftAssetRefsForSave } from './workflow/commands.js'
import { applyDraftPatch, type SaveDraftPatch } from './workflow/drafts.js'

async function saveCanonicalDraft(
  ctx: MutationCtx,
  args: {
    collection: Awaited<ReturnType<typeof loadEntryMutationContext>>['collection']
    entryId: Parameters<typeof applyDraftPatch>[1]['entryId']
    expectedDraftVersion: number
    appIdentityId: string
    now: number
    patch: SaveDraftPatch
  },
) {
  const relationLookups = new Map<string, { stableIds: Set<string> } | null>()
  const resolveRelationLookup = async (collectionSlug: string) => {
    if (relationLookups.has(collectionSlug)) {
      return relationLookups.get(collectionSlug) ?? null
    }
    const targetCollection = await ctx.db
      .query('collections')
      .withIndex('by_slug', (q) => q.eq('slug', collectionSlug))
      .first()
    if (!targetCollection) {
      relationLookups.set(collectionSlug, null)
      return null
    }
    const entries = await ctx.db
      .query('entries')
      .withIndex('by_collection_status', (q) => q.eq('collectionId', targetCollection._id))
      .collect()
    const lookup = {
      stableIds: new Set(entries.flatMap((entry) => (entry.stableId ? [entry.stableId] : []))),
    }
    relationLookups.set(collectionSlug, lookup)
    return lookup
  }
  const normalizedShared = args.patch.shared?.shared
    ? await rewriteStoredRelationData(
        args.collection.fields,
        args.patch.shared.shared,
        resolveRelationLookup,
      )
    : undefined
  const normalizedLocales = args.patch.locales
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(args.patch.locales).map(async ([locale, patch]) => [
            locale,
            {
              ...patch,
              ...(patch.values
                ? {
                    values: await rewriteStoredRelationData(
                      args.collection.fields,
                      patch.values,
                      resolveRelationLookup,
                    ),
                  }
                : {}),
            },
          ]),
        ),
      )
    : undefined
  const normalizedPatch: SaveDraftPatch = {
    ...(args.patch.shared
      ? {
          shared: {
            ...args.patch.shared,
            ...(normalizedShared ? { shared: normalizedShared } : {}),
          },
        }
      : {}),
    ...(normalizedLocales ? { locales: normalizedLocales } : {}),
  }
  const result = await applyDraftPatch(ctx, {
    entryId: args.entryId,
    expectedDraftVersion: args.expectedDraftVersion,
    appIdentity: args.appIdentityId,
    now: args.now,
    patch: normalizedPatch,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entryId,
    collectionId: result.entry.collectionId,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
    now: args.now,
  })
  const refreshed = await ctx.db.get(args.entryId)
  return {
    draftVersion: result.draftVersion,
    dirtyLocales: refreshed?.dirtyLocales ?? result.entry.dirtyLocales ?? [],
  }
}

async function revertCanonicalDraftToPublished(
  ctx: MutationCtx,
  args: {
    entry: Awaited<ReturnType<typeof loadEntryMutationContext>>['entry']
    appIdentityId: string
    now: number
  },
) {
  const publicRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id))
    .collect()
  const publicLocales = new Set(publicRows.map((row) => row.locale))
  const latestRevision = args.entry.latestRevisionId
    ? await ctx.db.get(args.entry.latestRevisionId)
    : null
  const snapshot = latestRevision?.snapshot ?? null

  const existingDrafts = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id))
    .collect()
  const sharedRow = existingDrafts.find((row) => row.locale === null)
  const sharedPayload = {
    entryId: args.entry._id,
    locale: null,
    baseRevisionId: args.entry.latestRevisionId ?? null,
    parentEntryId: snapshot?.parentEntryId ?? args.entry.parentEntryId ?? null,
    orderRank: snapshot?.orderRank ?? args.entry.orderRank ?? '',
    slug: snapshot?.slug ?? args.entry.baseSlug,
    shared: (snapshot?.shared ?? {}) as JsonMap,
    updatedBy: args.appIdentityId,
    updatedAt: args.now,
  }
  if (sharedRow) {
    await ctx.db.replace(sharedRow._id, sharedPayload)
  } else {
    await ctx.db.insert('entryDrafts', sharedPayload)
  }

  for (const draft of existingDrafts) {
    if (draft.locale !== null && !publicLocales.has(draft.locale)) {
      await ctx.db.delete(draft._id)
    }
  }

  for (const publicRow of publicRows) {
    const existing = existingDrafts.find((row) => row.locale === publicRow.locale)
    const payload = {
      entryId: args.entry._id,
      locale: publicRow.locale,
      baseRevisionId: publicRow.revisionId,
      localeSlug: publicRow.slug,
      values: (publicRow.data ?? {}) as JsonMap,
      bodyMdc: publicRow.bodyMdc ?? '',
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    }
    if (existing) {
      await ctx.db.replace(existing._id, payload)
    } else {
      await ctx.db.insert('entryDrafts', payload)
    }
  }

  const nextDraftVersion = args.entry.draftVersion + 1
  await ctx.db.patch(args.entry._id, {
    dirtyLocales: [],
    draftVersion: nextDraftVersion,
    updatedBy: args.appIdentityId,
    updatedAt: args.now,
  })
  return {
    draftVersion: nextDraftVersion,
    dirtyLocales: [],
  }
}

export const createLocaleVariant = callerMutation.protected({
  id: 'editor:createLocaleVariant',
  args: createLocaleVariantArgs.args,
  guard: canCreateEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const { appIdentityId, collection, entry, now } = await loadEntryMutationContext(
      ctx,
      args.entryId,
    )
    assertValidLocaleCode(args.locale, 'ENTRY_LOCALE_INVALID')
    const existing = await ctx.db
      .query('entryDrafts')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', args.locale))
      .first()
    if (existing) return String(existing._id)

    const slug = isLocalizedSlugMode(collection) ? entry.baseSlug : null
    if (slug) {
      const view = await readStudioDraftView(ctx, entry, collection)
      const localeView = view.locales.find((item) => item.locale === args.locale)
      await assertNoCanonicalDraftPathConflict(ctx, {
        collection,
        entryId: entry._id,
        locale: args.locale,
        path: localeView?.draftPath ?? `/${slug}`,
      })
    }

    const draftId = await ctx.db.insert('entryDrafts', {
      entryId: entry._id,
      locale: args.locale,
      baseRevisionId: entry.latestRevisionId ?? null,
      ...(slug ? { localeSlug: slug } : {}),
      values: {},
      bodyMdc: '',
      updatedBy: appIdentityId,
      updatedAt: now,
    })
    const dirtyLocales = Array.from(new Set([...(entry.dirtyLocales ?? []), args.locale]))
    await ctx.db.patch(entry._id, {
      dirtyLocales,
      draftVersion: entry.draftVersion + 1,
      updatedAt: now,
      updatedBy: appIdentityId,
    })
    return String(draftId)
  },
})

async function assertNoCanonicalDraftPathConflict(
  ctx: Parameters<typeof readStudioDraftView>[0],
  args: {
    collection: Awaited<ReturnType<typeof loadEntryMutationContext>>['collection']
    entryId: Parameters<typeof applyDraftPatch>[1]['entryId']
    locale: string
    path: string
  },
) {
  const entries = await ctx.db
    .query('entries')
    .filter((q) => q.eq(q.field('collectionId'), args.collection._id))
    .collect()
  for (const other of entries) {
    if (other._id === args.entryId) continue
    const view = await readStudioDraftView(ctx, other, args.collection)
    const locale = view.locales.find((item) => item.locale === args.locale)
    if (locale?.draftPath !== args.path) continue
    throwCmsError('ENTRY_PATH_CONFLICT', `Path "${args.path}" already exists`, {
      entryId: String(args.entryId),
      conflictingEntryId: String(other._id),
      locale: args.locale,
      path: args.path,
    })
  }
}

const saveEntryDraftDefinition = defineCmsOperation({
  id: 'ginko-cms.save-entry-draft',
  args: saveEntryDraftArgs.args,
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  handler: async (ctx, args) => {
    const { appIdentityId, collection, entry, now } = await loadEntryMutationContext(
      ctx,
      args.entryId,
      {
        expectedVersion: args.expectedDraftVersion,
      },
    )

    const sharedPatch = args.patch.shared
      ? {
          ...(args.patch.shared.parentEntryId !== undefined
            ? {
                parentEntryId: args.patch.shared.parentEntryId
                  ? asEntryId(args.patch.shared.parentEntryId)
                  : null,
              }
            : {}),
          ...(args.patch.shared.orderRank !== undefined
            ? { orderRank: args.patch.shared.orderRank }
            : {}),
          ...(args.patch.shared.slug !== undefined ? { slug: args.patch.shared.slug } : {}),
          ...(args.patch.shared.shared !== undefined
            ? { shared: args.patch.shared.shared as JsonMap }
            : {}),
        }
      : undefined

    const result = await saveCanonicalDraft(ctx, {
      collection,
      entryId: entry._id,
      expectedDraftVersion: args.expectedDraftVersion,
      appIdentityId,
      now,
      patch: {
        ...(sharedPatch ? { shared: sharedPatch } : {}),
        ...(args.patch.locales ? { locales: args.patch.locales as SaveDraftPatch['locales'] } : {}),
      },
    })

    const requestedNodeKind = args.patch.shared?.nodeKind
    if (requestedNodeKind !== undefined && requestedNodeKind !== entry.nodeKind) {
      const shouldBumpForNodeKind = result.draftVersion === entry.draftVersion
      const nextDraftVersion = shouldBumpForNodeKind ? result.draftVersion + 1 : result.draftVersion
      const current = await ctx.db.get(entry._id)
      const view = await readStudioDraftView(ctx, current ?? entry, collection)
      const dirtyLocales = shouldBumpForNodeKind
        ? Array.from(
            new Set([
              ...(current?.dirtyLocales ?? entry.dirtyLocales ?? []),
              ...view.locales.map((item) => item.locale),
            ]),
          )
        : (current?.dirtyLocales ?? entry.dirtyLocales ?? [])
      await ctx.db.patch(entry._id, {
        nodeKind: requestedNodeKind,
        draftVersion: nextDraftVersion,
        dirtyLocales,
        updatedAt: now,
        updatedBy: appIdentityId,
      })
      return {
        draftVersion: nextDraftVersion,
        dirtyLocales,
      }
    }

    return result
  },
})

export const saveEntryDraft = callerMutation.protected(saveEntryDraftDefinition)

export const mcpSaveEntryDraft = callerMutation.protected({
  id: 'editor:mcpSaveEntryDraft',
  args: {
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
  },
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  handler: async (ctx, args) => {
    const { agentRunId, ...input } = args
    await recordOwnedAgentRunWrite(ctx, agentRunId, 'ginko-cms.save-entry-draft')
    return await saveEntryDraftDefinition.handler(ctx, input)
  },
})

export const revertDraftToPublishedOperation = defineCmsOperation({
  id: 'ginko-cms.revert-draft-to-published',
  name: 'revert-draft-to-published',
  kind: 'destructive',
  executeFunctionRef: 'entries/draft:revertDraftToPublishedOperationExecute',
  args: revertDraftToPublishedArgs.args,
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  previewReturns: previewResultValidator(),
  load: async () => undefined,
  preview: async (ctx, args) => {
    const result = await getDraftVsPublishedDiffPreview(ctx as never, args)
    return buildPreview({
      summary: `Will reset the draft to published state and replace ${result.changes.length} changed field${result.changes.length === 1 ? '' : 's'}.`,
      allowed: result.changes.length > 0,
      blockers:
        result.changes.length === 0
          ? [
              operationIssue({
                code: 'no-draft-changes',
                message: 'There are no draft changes to revert.',
              }),
            ]
          : [],
      warnings: result.changes.length
        ? [
            operationIssue({
              code: 'draft-changes-lost',
              message: 'All listed unpublished draft changes will be lost.',
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'fields',
          summary: 'Draft fields replaced',
          count: result.changes.length,
        }),
      ],
      details: result,
      confirm: {
        operationId: 'ginko-cms.revert-draft-to-published',
        args,
        effect: result,
      },
      version: {
        changeCount: result.changes.length,
      },
    })
  },
  handler: async (ctx, args) => {
    const { appIdentityId, collection, entry, now } = await loadEntryMutationContext(
      ctx,
      args.entryId,
    )
    void collection
    return await revertCanonicalDraftToPublished(ctx, { entry, appIdentityId, now })
  },
})

export const revertDraftToPublishedOperationExecute = callerMutation.protected(
  revertDraftToPublishedOperation,
)
export const previewRevertDraftToPublishedOperation = callerMutation.protected(
  Object.assign(definePreview(revertDraftToPublishedOperation), {
    id: 'entries/draft:previewRevertDraftToPublishedOperation',
  }),
)
