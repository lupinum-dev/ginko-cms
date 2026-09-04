import {
  createLocaleVariant as createLocaleVariantArgs,
  revertDraftToPublished as revertDraftToPublishedArgs,
  saveEntryDraft as saveEntryDraftArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { draftSaveResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { getOwnActiveAgentRunOrThrow } from '../agentRuns.js'
import { canEditEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import { assertCollectionSupportsLocale, isLocalizedSlugMode } from '../lib/collections.js'
import { asEntryId } from '../lib/ids.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
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
import { deriveDirtyLocales, loadEntryMutationContext } from './context.js'
import { assertNoDraftSiblingPathConflict } from './draftPathConflicts.js'
import { getDraftVsPublishedDiffPreview } from './history.js'
import { createExactRelationReferenceResolver, rewriteStoredRelationData } from './relations.js'
import { deleteAssetRefsForSource } from './workflow/assetRefs.js'
import { refreshDraftAssetRefsForSave } from './workflow/commands.js'
import { assertValidDraftParentChain } from './workflow/draftPlacement.js'
import { applyDraftPatch, type SaveDraftPatch } from './workflow/drafts.js'
import { deleteDraftSearchEntry } from './workflow/draftSearch.js'
import { stableHash } from './workflow/hashing.js'

async function currentDirtyLocales(
  ctx: MutationCtx,
  entryId: Parameters<typeof applyDraftPatch>[1]['entryId'],
) {
  const entry = await ctx.db.get(entryId)
  if (!entry) return []
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .collect()
  return deriveDirtyLocales(entry, new Map(rows.map((row) => [row.locale, row.version])))
}

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
  const relationReferenceExists = createExactRelationReferenceResolver(ctx)
  const normalizedShared = args.patch.shared?.shared
    ? await rewriteStoredRelationData(
        args.collection.fields,
        args.patch.shared.shared,
        relationReferenceExists,
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
                      relationReferenceExists,
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
  const sharedRouteChanged =
    normalizedPatch.shared?.parentEntryId !== undefined ||
    normalizedPatch.shared?.slug !== undefined
  if (normalizedPatch.shared?.parentEntryId !== undefined) {
    await assertValidDraftParentChain(ctx, {
      entry: result.entry,
      collection: args.collection,
    })
  }
  const routeLocales = sharedRouteChanged
    ? args.collection.locales
    : Object.entries(normalizedPatch.locales ?? {}).flatMap(([locale, patch]) =>
        patch.slug !== undefined ? [locale] : [],
      )
  if (routeLocales.length > 0) {
    await assertNoDraftSiblingPathConflict(ctx, {
      entry: result.entry,
      collection: args.collection,
      locales: routeLocales,
    })
  }
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entryId,
    collection: result.entry.collection,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
  })
  return {
    draftVersion: result.draftVersion,
    dirtyLocales: await currentDirtyLocales(ctx, args.entryId),
  }
}

async function revertCanonicalDraftToPublished(
  ctx: MutationCtx,
  args: {
    entry: Awaited<ReturnType<typeof loadEntryMutationContext>>['entry']
    collection: Awaited<ReturnType<typeof loadEntryMutationContext>>['collection']
    appIdentityId: string
    now: number
  },
) {
  if (!args.entry.activePublications.length) {
    return { draftVersion: args.entry.draftVersion, dirtyLocales: [] }
  }
  const snapshots = await Promise.all(
    args.entry.activePublications.map(async (publication) => {
      const revision = await ctx.db.get(publication.revisionId)
      const snapshot = revision?.snapshots[publication.locale]
      if (!snapshot) throw new Error(`Missing active ${publication.locale} publication snapshot`)
      return [publication.locale, snapshot] as const
    }),
  )
  const sharedHashes = new Set(
    snapshots.map(([, snapshot]) =>
      stableHash({
        shared: snapshot.shared,
        ...(isLocalizedSlugMode(args.collection) ? {} : { slug: snapshot.slug }),
        parentEntryId: snapshot.parentEntryId ? String(snapshot.parentEntryId) : null,
        orderRank: snapshot.orderRank,
      }),
    ),
  )
  if (sharedHashes.size !== 1) {
    throw new Error(
      'Published locales have different shared snapshots; revert locales individually instead.',
    )
  }
  const first = snapshots[0]![1]
  const sharedSlugSnapshot =
    snapshots.find(([locale]) => locale === args.collection.locales[0])?.[1] ?? first
  const result = await applyDraftPatch(ctx, {
    entryId: args.entry._id,
    expectedDraftVersion: args.entry.draftVersion,
    appIdentity: args.appIdentityId,
    now: args.now,
    patch: {
      shared: {
        shared: first.shared,
        slug: sharedSlugSnapshot.slug,
        parentEntryId: first.parentEntryId,
        orderRank: first.orderRank,
      },
      locales: Object.fromEntries(
        snapshots.map(([locale, snapshot]) => [
          locale,
          { slug: snapshot.slug, values: snapshot.values, bodyMdc: snapshot.bodyMdc },
        ]),
      ),
    },
  })
  await assertValidDraftParentChain(ctx, {
    entry: result.entry,
    collection: args.collection,
  })
  await assertNoDraftSiblingPathConflict(ctx, {
    entry: result.entry,
    collection: args.collection,
    locales: snapshots.map(([locale]) => locale),
  })
  const publishedLocales = new Set(snapshots.map(([locale]) => locale))
  const existingDrafts = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', args.entry._id))
    .collect()
  const removedLocales: string[] = []
  for (const draft of existingDrafts) {
    if (!publishedLocales.has(draft.locale)) {
      await ctx.db.delete(draft._id)
      await deleteAssetRefsForSource(
        ctx,
        { sourceKind: 'draft', sourceId: `${args.entry._id}:${draft.locale}` },
        'canonical',
      )
      await deleteDraftSearchEntry(ctx, args.entry._id, draft.locale)
      removedLocales.push(draft.locale)
    }
  }
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
  })
  for (const locale of removedLocales) {
    await deleteDraftSearchEntry(ctx, args.entry._id, locale)
  }
  return { draftVersion: result.draftVersion, dirtyLocales: [] }
}

export const createLocaleVariant = callerMutation.protected({
  id: 'editor:createLocaleVariant',
  args: createLocaleVariantArgs.args,
  guard: canEditEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const { appIdentityId, collection, entry, now } = await loadEntryMutationContext(
      ctx,
      args.entryId,
    )
    assertValidLocaleCode(args.locale, 'ENTRY_LOCALE_INVALID')
    assertCollectionSupportsLocale(collection, args.locale)
    const existing = await ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', args.locale))
      .unique()
    if (existing) return String(existing._id)

    let sourceDraft: Doc<'entryLocaleDrafts'> | null = null
    if (args.source.kind === 'locale') {
      const sourceLocale = args.source.locale
      assertValidLocaleCode(sourceLocale, 'ENTRY_LOCALE_SOURCE_INVALID')
      assertCollectionSupportsLocale(collection, sourceLocale)
      if (sourceLocale === args.locale) {
        throwCmsError(
          'ENTRY_LOCALE_SOURCE_INVALID',
          'A translation cannot copy from the locale it is creating.',
          { entryId: args.entryId, locale: args.locale },
        )
      }
      sourceDraft = await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', sourceLocale))
        .unique()
      if (!sourceDraft) {
        throwCmsError(
          'ENTRY_LOCALE_SOURCE_MISSING',
          `No draft exists for source locale "${sourceLocale}".`,
          {
            entryId: args.entryId,
            locale: args.locale,
            sourceLocale,
          },
        )
      }
    }

    const slug = isLocalizedSlugMode(collection) ? (sourceDraft?.slug ?? null) : null

    const draftId = await ctx.db.insert('entryLocaleDrafts', {
      entryId: entry._id,
      locale: args.locale,
      slug,
      values: sourceDraft?.values ?? {},
      bodyMdc: sourceDraft?.bodyMdc ?? '',
      version: 1,
      updatedBy: appIdentityId,
      updatedAt: now,
    })
    if (slug) {
      await assertNoDraftSiblingPathConflict(ctx, {
        entry,
        collection,
        locales: [args.locale],
      })
    }
    await ctx.db.patch(entry._id, {
      draftVersion: entry.draftVersion + 1,
      updatedAt: now,
      updatedBy: appIdentityId,
    })
    await refreshDraftAssetRefsForSave(ctx, {
      entryId: entry._id,
      collection: entry.collection,
      sharedUpdated: false,
      affectedLocales: [args.locale],
    })
    await logActivity(ctx, {
      kind: 'entry.translation-created',
      summary:
        args.source.kind === 'blank'
          ? `Started blank ${args.locale} translation`
          : `Copied ${args.source.locale} into ${args.locale} translation`,
      appIdentityId,
      entryId: entry._id,
      collection: entry.collection,
      locale: args.locale,
      detail: {
        sourceKind: args.source.kind,
        sourceLocale: args.source.kind === 'locale' ? args.source.locale : null,
      },
      createdAt: now,
    })
    return String(draftId)
  },
})

const saveEntryDraftDefinition = defineCmsOperation({
  id: 'ginko-cms.save-entry-draft',
  args: saveEntryDraftArgs.args,
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
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
                  ? asEntryId(ctx, args.patch.shared.parentEntryId)
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
          ...(args.patch.shared.nodeKind !== undefined
            ? { nodeKind: args.patch.shared.nodeKind }
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

    return result
  },
})

export const saveEntryDraft = callerMutation.protected(saveEntryDraftDefinition)

export const mcpSaveEntryDraft = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'editor:mcpSaveEntryDraft',
  args: {
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
  },
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  handler: async (ctx, args) => {
    const { agentRunId, ...input } = args
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const agentRun = await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, now)
    const result = await saveEntryDraftDefinition.handler(ctx, input)
    if (result.draftVersion !== input.expectedDraftVersion) {
      await ctx.db.patch(agentRun._id, {
        updatedAt: now,
        lastWriteAt: now,
      })
      await logActivity(ctx, {
        kind: 'entry.draft-saved',
        summary: 'Saved entry draft',
        appIdentityId: appIdentity.userId,
        entryId: asEntryId(ctx, input.entryId),
        detail: {
          agentRunId,
          draftVersion: result.draftVersion,
        },
        createdAt: now,
      })
    }
    return result
  },
})

export const revertDraftToPublishedOperation = defineCmsOperation({
  id: 'ginko-cms.revert-draft-to-published',
  kind: 'destructive',
  executeFunctionRef: 'entries/draft:revertDraftToPublishedOperationExecute',
  args: revertDraftToPublishedArgs.args,
  guard: canEditEntries,
  returns: draftSaveResultValidator,
  previewReturns: previewResultValidator(),
  load: async () => undefined,
  preview: async (ctx, args) => {
    const result = await getDraftVsPublishedDiffPreview(ctx, args)
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
    await assertCmsContractWritable(ctx)
    const { appIdentityId, collection, entry, now } = await loadEntryMutationContext(
      ctx,
      args.entryId,
    )
    return await revertCanonicalDraftToPublished(ctx, {
      entry,
      collection,
      appIdentityId,
      now,
    })
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
