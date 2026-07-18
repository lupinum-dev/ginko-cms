import {
  archiveEntry as archiveEntryArgs,
  createCheckpoint as createCheckpointArgs,
  listPublishRouteImpactPage as listPublishRouteImpactPageArgs,
  publishEntry as publishEntryArgs,
  restoreEntry as restoreEntryArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  ginkoPublishRouteImpactPageResultValidator,
  publishResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import { getOwnActiveAgentRunOrThrow } from '../agentRuns.js'
import { canArchiveEntries, canEditEntries, canPublishEntries } from '../auth/checks.js'
import { previewPublishImpactForEntry } from '../diagnostics.js'
import { throwCmsError } from '../errors.js'
import { callerMutation, callerQuery } from '../functions.js'
import { assertCollectionSupportsLocale, getCollectionDefaultLocale } from '../lib/collections.js'
import { MAX_CONVEX_DOCUMENT_BYTES, mdcBodySize } from '../lib/contentLimits.js'
import { asEntryId } from '../lib/ids.js'
import { readInstalledCmsContract } from '../lib/installedContract.js'
import { getRoutingLocales } from '../lib/locale.js'
import {
  defineCmsOperation,
  operationEffect,
  operationExecuteResultValidator,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from '../operationHelpers.js'
import { deriveDirtyLocales, getCollectionForEntry, loadEntryMutationContext } from './context.js'
import { previewDestructiveEntryOperation } from './destructivePreview.js'
import {
  executeCanonicalPublish as executePublicationOperation,
  type PublishAuthorization,
  type PublishOperationArgs,
} from './publicationApproval.js'
import { inspectRestoreEligibility, type RestoreEligibilityIssue } from './restoreEligibility.js'
import {
  archiveCurrentEntry,
  computePublishDraftHash,
  createDraftCheckpoint,
  publishCurrentDraft,
  restoreArchivedEntry,
  unpublishCurrentPublic,
} from './workflow/commands.js'
import { buildDraftSnapshots } from './workflow/draftCommands.js'
import { readDraftRows } from './workflow/drafts.js'
import {
  validateRevisionSnapshotsForActivation,
  workflowOperationId,
} from './workflow/publicationCommands.js'
import {
  computeDraftPublicPathForLocale,
  paginatePublishedDescendantRouteChanges,
} from './workflow/publishImpact.js'
import { measureNextRevisionDocument } from './workflow/revisions.js'
import { readRouteGeneration } from './workflow/routeGeneration.js'

const PUBLISH_OPERATION_ID = 'ginko-cms.publish-entry'
const PUBLISH_EXECUTE_PATH = 'entries/publish:publishEntryOperationExecute'

type UnpublishEntryInput = {
  entryId: string
  locales: string[]
}

type UnpublishEntryLoaded = {
  entry: Doc<'entries'>
  collection: Awaited<ReturnType<typeof getCollectionForEntry>>
  locales: string[]
  destructivePreview: Awaited<ReturnType<typeof previewDestructiveEntryOperation>>
}

function boundedEffectCount(count: number, exact: boolean) {
  return exact ? { count } : { count: null, minimumCount: count, countLabel: `${count}+` }
}

function formatAffectedRoutes(
  routes: Array<{ locale: string; href: string; path?: string | null }>,
): string {
  return routes.map((route) => `${route.locale}: ${route.href}`).join(', ')
}

function archiveBlockers(result: Awaited<ReturnType<typeof previewDestructiveEntryOperation>>) {
  const blockers = []
  if (result.status === 'archived') {
    blockers.push(
      operationIssue({ code: 'already-archived', message: 'Entry is already archived.' }),
    )
  }
  if (result.inboundRelations.total > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-inbound-relations',
        message: `${result.inboundRelations.total} current relation${result.inboundRelations.total === 1 ? '' : 's'} must be resolved before this entry can be archived.`,
        details: result.inboundRelations,
      }),
    )
  }
  if (result.redirects.hasMore) {
    blockers.push(
      operationIssue({
        code: 'redirect-impact-too-large',
        message: 'Archive impact exceeds the supported limit of 100 active redirects.',
      }),
    )
  }
  return blockers
}

function cmsOperationIssue(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  const data = error.data
  if (!data || typeof data !== 'object' || !('code' in data) || !('message' in data)) return null
  if (typeof data.code !== 'string' || typeof data.message !== 'string') return null
  return operationIssue({ code: data.code, message: data.message })
}

function descendantReachabilityWarning(
  result: Awaited<ReturnType<typeof previewDestructiveEntryOperation>>,
) {
  return result.publicDescendantRoutes.length
    ? operationIssue({
        code: 'descendant-routes-unreachable',
        message: `${result.publicDescendantRoutes.length} published descendant route${result.publicDescendantRoutes.length === 1 ? '' : 's'} will become unreachable without changing the descendants' editorial records.`,
      })
    : null
}

export const publishEntryOperation = defineCmsOperation({
  id: PUBLISH_OPERATION_ID,
  kind: 'destructive',
  executeFunctionRef: PUBLISH_EXECUTE_PATH,
  args: publishEntryArgs.args,
  guard: canPublishEntries,
  returns: publishResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(ctx, args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', {
        entryId: args.entryId,
      })
    }
    if (entry.draftVersion !== args.expectedVersion) {
      throwCmsError(
        'ENTRY_CONCURRENT_EDIT',
        'This entry changed in another session. Reload and try again.',
        {
          entryId: args.entryId,
          expectedVersion: args.expectedVersion,
          actualVersion: entry.draftVersion,
          currentVersion: entry.draftVersion,
          retryable: true,
        },
      )
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
    }
  },
  preview: async (ctx, args, { entry, collection }) => {
    const result = await previewPublishImpactForEntry(ctx, {
      collection: collection.slug,
      entryId: args.entryId,
      locales: args.locales,
    })
    const localeStatuses = result.locales.map((item) => `${item.locale}: ${item.status}`)
    const blockingMessages = result.blockingDiagnostics.map((item) => item.message).filter(Boolean)
    const warnings = result.warnings.map((item) => item.message).filter(Boolean)
    const descendantRoutes = result.locales.reduce(
      (count, locale) => count + (locale.routeImpact.total ?? locale.routeImpact.listed),
      0,
    )
    const listedDescendantRoutes = result.locales.reduce(
      (count, locale) => count + locale.routeImpact.listed,
      0,
    )
    const affectedRoutes =
      result.changes.filter((change) => change.kind === 'route' && change.scope !== 'descendant')
        .length + descendantRoutes
    const totalChanges = result.changes.length - listedDescendantRoutes + descendantRoutes
    const descendantRoutesExact = result.locales.every(
      (locale) => locale.routeImpact.total !== null,
    )
    const draftRows = await readDraftRows(ctx, entry._id)
    const publishBlockers = blockingMessages.map((message) =>
      operationIssue({ code: 'publish-blocker', message }),
    )
    for (const locale of args.locales) {
      const row = draftRows.byLocale[locale]
      if (!row) continue
      const size = mdcBodySize(row.bodyMdc)
      if (!size.allowed) {
        publishBlockers.push(
          operationIssue({
            code: 'ENTRY_BODY_TOO_LARGE',
            message: `Rich content for ${locale} exceeds the 64 KiB publish limit.`,
          }),
        )
      }
    }
    if (publishBlockers.length === 0) {
      try {
        const snapshots = await buildDraftSnapshots(ctx, entry, collection, args.locales, true)
        const installed = await readInstalledCmsContract(ctx)
        const identity = await ctx.appIdentity()
        const now = Date.now()
        const revisionInput = {
          entryId: entry._id,
          collection: entry.collection,
          parentRevisionId: entry.latestEditorialRevisionId,
          kind: 'publish' as const,
          snapshots,
          affectedLocales: args.locales,
          contentHash: installed?.record.contentHash ?? '',
          operationId: workflowOperationId('publish', entry._id, now),
          message: args.message ?? null,
          appIdentity: identity.userId,
          now,
        }
        const revisionSize = await measureNextRevisionDocument(ctx, revisionInput)
        if (revisionSize.actualBytes > MAX_CONVEX_DOCUMENT_BYTES) {
          publishBlockers.push(
            operationIssue({
              code: 'REVISION_DOCUMENT_TOO_LARGE',
              message: 'The immutable publication revision exceeds the Convex document limit.',
            }),
          )
        } else {
          await validateRevisionSnapshotsForActivation(ctx, {
            entry,
            collection,
            revisionId: (entry.latestEditorialRevisionId ??
              entry._id) as unknown as Id<'entryRevisions'>,
            snapshots,
            stableNow: now,
          })
        }
      } catch (error) {
        const issue = cmsOperationIssue(error)
        if (!issue) throw error
        publishBlockers.push(issue)
      }
    }
    const dirtyLocaleCount = deriveDirtyLocales(
      entry,
      new Map(Object.values(draftRows.byLocale).map((row) => [row.locale, row.version])),
    ).filter((locale) => args.locales.includes(locale)).length
    const routeGenerations = Object.fromEntries(
      await Promise.all(
        args.locales.map(async (locale: string) => [
          locale,
          await readRouteGeneration(ctx, collection.slug, locale),
        ]),
      ),
    )
    return buildPreview({
      summary: `Publish impact for entry ${args.entryId} (${args.locales.join(', ') || 'all requested locales'}): ${result.status}${localeStatuses.length ? ` - ${localeStatuses.join(', ')}` : ''}.`,
      allowed: publishBlockers.length === 0,
      blockers: publishBlockers,
      warnings: warnings.map((message) => operationIssue({ code: 'publish-warning', message })),
      effects: [
        operationEffect({
          kind: 'locales',
          summary: 'Locales evaluated',
          count: result.locales.length,
        }),
        operationEffect({
          kind: 'dirty-locales',
          summary: 'Dirty locales to publish',
          count: dirtyLocaleCount,
        }),
        operationEffect({
          kind: 'routes',
          summary: 'Public routes affected',
          ...boundedEffectCount(affectedRoutes, descendantRoutesExact),
        }),
        operationEffect({
          kind: 'changes',
          summary: 'Public output changes',
          ...boundedEffectCount(totalChanges, descendantRoutesExact),
        }),
        operationEffect({
          kind: 'events',
          summary: 'Revalidation events',
          count: result.events.length,
        }),
      ],
      details: {
        publishImpact: result,
      },
      confirm: {
        operationId: PUBLISH_OPERATION_ID,
        args,
        status: result.status,
        changes: result.changes,
        routeImpact: result.locales.map((locale) => ({
          locale: locale.locale,
          ...locale.routeImpact,
        })),
        events: result.events,
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
        routeGenerations,
      },
    })
  },
  handler: async (ctx, args, { entry }) => {
    const appIdentity = await ctx.appIdentity()
    const expectedDraftHash = await computePublishDraftHash(ctx, {
      entryId: entry._id,
      locales: args.locales,
    })
    const result = await publishCurrentDraft(ctx, {
      entryId: entry._id,
      locales: args.locales,
      expectedDraftVersion: args.expectedVersion,
      expectedDraftHash,
      appIdentity: appIdentity.userId,
      message: args.message ?? null,
    })
    const refreshed = (await ctx.db.get(entry._id)) as typeof entry | null
    const refreshedDraftRows = refreshed ? await readDraftRows(ctx, refreshed._id) : null
    return {
      versionId: String(result.revisionId),
      dirtyLocales:
        refreshed && refreshedDraftRows
          ? deriveDirtyLocales(
              refreshed,
              new Map(
                Object.values(refreshedDraftRows.byLocale).map((row) => [row.locale, row.version]),
              ),
            )
          : [],
      draftVersion: refreshed?.draftVersion ?? args.expectedVersion,
    }
  },
})

type PublishOperationCtx = Parameters<typeof publishEntryOperation.handler>[0]

export async function executeCanonicalPublish(
  ctx: PublishOperationCtx,
  args: PublishOperationArgs,
  authorization: PublishAuthorization,
) {
  return await executePublicationOperation(ctx, publishEntryOperation, args, authorization)
}

export const publishEntryOperationExecute = callerMutation.protected({
  id: PUBLISH_EXECUTE_PATH,
  args: {
    ...publishEntryArgs.args,
    _confirmationToken: v.optional(v.string()),
  },
  returns: operationExecuteResultValidator(publishResultValidator),
  handler: async (ctx, args) => {
    const { _confirmationToken, ...operationArgs } = args
    return await executeCanonicalPublish(ctx, operationArgs, {
      kind: 'confirmation',
      token: _confirmationToken,
    })
  },
})
export const previewPublishEntryOperation = callerMutation.protected(
  Object.assign(definePreview(publishEntryOperation), {
    id: 'entries/publish:previewPublishEntryOperation',
  }),
)

export const listPublishRouteImpactPage = callerQuery.protected({
  id: 'entries/publish:listPublishRouteImpactPage',
  args: listPublishRouteImpactPageArgs.args,
  guard: canPublishEntries,
  returns: ginkoPublishRouteImpactPageResultValidator,
  handler: async (ctx, args) => {
    const parsedEntryId = ctx.db.normalizeId('entries', args.entryId)
    const entry = parsedEntryId ? await ctx.db.get(parsedEntryId) : null
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
    }
    if (entry.draftVersion !== args.expectedVersion) {
      throwCmsError(
        'PUBLISH_IMPACT_STALE',
        'The draft changed after this publish impact was prepared.',
        {
          entryId: args.entryId,
          expectedVersion: args.expectedVersion,
          actualVersion: entry.draftVersion,
        },
      )
    }
    if (args.cursor && args.cursor.length > 8_192) {
      throwCmsError('INVALID_CURSOR', 'Publish impact cursor is too long.')
    }
    const limit = args.limit ?? 25
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throwCmsError('INVALID_LIMIT', 'Publish impact page size must be an integer from 1 to 100.')
    }

    const collection = await getCollectionForEntry(ctx, entry)
    assertCollectionSupportsLocale(collection, args.locale)
    const routeGeneration = await readRouteGeneration(ctx, collection.slug, args.locale)
    if (routeGeneration !== args.expectedRouteGeneration) {
      throwCmsError(
        'PUBLISH_IMPACT_STALE',
        'Public routes changed after this publish impact was prepared.',
        {
          collection: collection.slug,
          locale: args.locale,
          expectedRouteGeneration: args.expectedRouteGeneration,
          actualRouteGeneration: routeGeneration,
        },
      )
    }

    const draftRows = await readDraftRows(ctx, entry._id)
    const localeDraftRow = draftRows.byLocale[args.locale]
    if (!localeDraftRow) {
      throwCmsError('PUBLISH_IMPACT_STALE', 'The locale draft no longer exists.', {
        entryId: args.entryId,
        locale: args.locale,
      })
    }
    const parentEntryId =
      draftRows.shared?.parentEntryId !== undefined
        ? (draftRows.shared.parentEntryId ?? null)
        : (entry.parentEntryId ?? null)
    const nextRootPath = await computeDraftPublicPathForLocale(ctx, {
      collection,
      entry,
      locale: args.locale,
      parentEntryId,
      slug: localeDraftRow.slug ?? draftRows.shared?.slug ?? entry.slug,
    })
    const activeRoutingLocales = await getRoutingLocales(
      ctx,
      collection.locales,
      getCollectionDefaultLocale(collection),
    )
    const page = await paginatePublishedDescendantRouteChanges(ctx, {
      collection,
      entryId: entry._id,
      locale: args.locale,
      nextRootPath,
      activeRoutingLocales,
      draftVersion: entry.draftVersion,
      routeGeneration,
      cursor: args.cursor,
      limit,
    })
    return {
      collection: collection.slug,
      entryId: args.entryId,
      locale: args.locale,
      draftVersion: entry.draftVersion,
      routeGeneration,
      changes: page.page.map((change) => ({
        locale: args.locale,
        entryId: change.entryId,
        scope: 'descendant' as const,
        kind: 'route' as const,
        label: `Descendant public route: ${change.title}`,
        before: change.currentHref,
        after: change.nextHref,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

export const mcpPreviewPublishEntry = callerMutation.protected({
  id: 'entries/publish:mcpPreviewPublishEntry',
  args: {
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  },
  guard: canEditEntries,
  returns: previewResultValidator(),
  handler: async (ctx, args) => {
    const { agentRunId, ...input } = args
    const appIdentity = await ctx.appIdentity()
    await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, Date.now())
    const loaded = await publishEntryOperation.load(ctx, input)
    const preview = await publishEntryOperation.preview(ctx, input, loaded)
    return { ...preview, confirm: null, confirmation: null }
  },
})

export const unpublishEntryOperation = defineCmsOperation({
  id: 'ginko-cms.unpublish-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:unpublishEntryOperationExecute',
  args: unpublishEntryArgs.args,
  guard: canPublishEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args: UnpublishEntryInput) => {
    const entry = await ctx.db.get(asEntryId(ctx, args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    if (args.locales.length === 0) {
      throwCmsError('ENTRY_LOCALES_REQUIRED', 'Select at least one locale to unpublish.')
    }
    const locales = [...new Set(args.locales)].sort()
    if (locales.length !== args.locales.length) {
      throwCmsError('ENTRY_LOCALES_DUPLICATED', 'Each locale may be selected only once.')
    }
    const collection = await getCollectionForEntry(ctx, entry)
    for (const locale of locales) assertCollectionSupportsLocale(collection, locale)
    return {
      entry,
      collection,
      locales,
      destructivePreview: await previewDestructiveEntryOperation(ctx, args.entryId, { locales }),
    }
  },
  preview: async (_ctx, args: UnpublishEntryInput, loaded: UnpublishEntryLoaded) => {
    const { entry, locales, destructivePreview: result } = loaded
    const publishedLocales = new Set(Object.keys(result.publicRevisionIdsByLocale))
    const missingLocales = locales.filter((locale) => !publishedLocales.has(locale))
    const blockers = [
      ...missingLocales.map((locale) =>
        operationIssue({
          code: 'locale-not-public',
          message: `Locale "${locale}" is not currently public.`,
        }),
      ),
      ...(result.redirects.hasMore
        ? [
            operationIssue({
              code: 'redirect-impact-too-large',
              message: 'Unpublish impact exceeds the supported limit of 100 active redirects.',
            }),
          ]
        : []),
    ]
    const descendantWarning = descendantReachabilityWarning(result)
    return buildPreview({
      summary: `Will unpublish "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        ...(result.publicRoutes.length
          ? [
              operationIssue({
                code: 'affected-routes',
                message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
              }),
            ]
          : []),
        ...(descendantWarning ? [descendantWarning] : []),
        ...(result.redirects.minimumCount > 0
          ? [
              operationIssue({
                code: 'redirect-target-temporarily-unavailable',
                message: `${result.redirects.minimumCount}${result.redirects.hasMore ? '+' : ''} active redirect${result.redirects.minimumCount === 1 && !result.redirects.hasMore ? '' : 's'} will remain recorded but cannot resolve for the selected locale until it is republished.`,
              }),
            ]
          : []),
        ...(result.assetImpact.minimumCount > 0
          ? [
              operationIssue({
                code: 'assets-retained-after-unpublish',
                message: 'Referenced assets remain retained by the draft and immutable history.',
              }),
            ]
          : []),
      ],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
          count: result.publicRoutes.length,
        }),
        operationEffect({
          kind: 'descendant-routes',
          summary: 'Published descendant routes checked',
          count: result.publicDescendantRoutes.length,
        }),
        operationEffect({
          kind: 'navigation',
          summary: 'Navigation records removed',
          count: result.discoveryImpact.navigationLocales.length,
        }),
        operationEffect({
          kind: 'search',
          summary: 'Search records removed',
          count: result.discoveryImpact.searchLocales.length,
        }),
        operationEffect({
          kind: 'sitemap',
          summary: 'Sitemap records removed',
          count: result.discoveryImpact.sitemapLocales.length,
        }),
        operationEffect({
          kind: 'alternates',
          summary: 'Remaining locale alternate sets refreshed',
          count: entry.activePublications.filter((row) => !locales.includes(row.locale)).length,
        }),
        operationEffect({
          kind: 'revalidation',
          summary: 'Revalidation events enqueued',
          count: result.revalidation.eventCount,
        }),
      ],
      details: {
        publicRoutes: result.publicRoutes,
        publicDescendantRoutes: result.publicDescendantRoutes,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        inboundRelations: result.inboundRelations,
        assetImpact: result.assetImpact,
        discoveryImpact: result.discoveryImpact,
        redirects: result.redirects,
        revalidation: result.revalidation,
        locales,
      },
      confirm: {
        operationId: 'ginko-cms.unpublish-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          publicDescendantRoutes: result.publicDescendantRoutes,
          publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
          discoveryImpact: result.discoveryImpact,
          redirects: result.redirects,
          revalidation: result.revalidation,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        publicDescendantRouteCount: result.publicDescendantRoutes.length,
        inboundRelationCount: result.inboundRelations.total,
        locales,
        assetFence: result.assetImpact.fence,
        redirectFence: result.redirects.fence,
        revalidationFence: result.revalidation.fence,
      },
    })
  },
  handler: async (ctx, _args, loaded: UnpublishEntryLoaded) => {
    const { entry, collection, locales, destructivePreview } = loaded
    const appIdentity = await ctx.appIdentity()
    await unpublishCurrentPublic(ctx, {
      entryId: entry._id,
      locales,
      expectedPublicRevisionIds: destructivePreview.publicRevisionIdsByLocale,
      appIdentity: appIdentity.userId,
    })
    void collection
    return null
  },
})

export const unpublishEntryOperationExecute = callerMutation.protected(unpublishEntryOperation)
export const previewUnpublishEntryOperation = callerMutation.protected(
  Object.assign(definePreview(unpublishEntryOperation), {
    id: 'entries/publish:previewUnpublishEntryOperation',
  }),
)

export const archiveEntryOperation = defineCmsOperation({
  id: 'ginko-cms.archive-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:archiveEntryOperationExecute',
  args: archiveEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(ctx, args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
      destructivePreview: await previewDestructiveEntryOperation(ctx, args.entryId),
    }
  },
  preview: async (_ctx, args, { entry, destructivePreview: result }) => {
    const blockers = archiveBlockers(result)
    const descendantWarning = descendantReachabilityWarning(result)
    return buildPreview({
      summary: `Will archive "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        ...(result.publicRoutes.length
          ? [
              operationIssue({
                code: 'affected-routes',
                message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
              }),
            ]
          : []),
        ...(descendantWarning ? [descendantWarning] : []),
        ...(result.redirects.minimumCount > 0
          ? [
              operationIssue({
                code: 'redirect-target-temporarily-unavailable',
                message: `${result.redirects.minimumCount}${result.redirects.hasMore ? '+' : ''} active redirect${result.redirects.minimumCount === 1 && !result.redirects.hasMore ? '' : 's'} will remain recorded but cannot resolve until this entry is restored and republished.`,
              }),
            ]
          : []),
        ...(result.assetImpact.minimumCount > 0
          ? [
              operationIssue({
                code: 'assets-retained-with-archive',
                message: 'Referenced assets remain retained by the archived drafts and history.',
              }),
            ]
          : []),
      ],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
          count: result.publicRoutes.length,
        }),
        operationEffect({
          kind: 'descendant-routes',
          summary: 'Published descendant routes checked',
          count: result.publicDescendantRoutes.length,
        }),
        operationEffect({
          kind: 'navigation',
          summary: 'Navigation records removed',
          count: result.discoveryImpact.navigationLocales.length,
        }),
        operationEffect({
          kind: 'search',
          summary: 'Search records removed',
          count: result.discoveryImpact.searchLocales.length,
        }),
        operationEffect({
          kind: 'sitemap',
          summary: 'Sitemap records removed',
          count: result.discoveryImpact.sitemapLocales.length,
        }),
        operationEffect({
          kind: 'assets',
          summary: 'Referenced assets retained with archived content',
          ...(result.assetImpact.count === null
            ? {
                count: null,
                minimumCount: result.assetImpact.minimumCount,
                countLabel: `${result.assetImpact.minimumCount}+`,
              }
            : { count: result.assetImpact.count }),
        }),
        operationEffect({
          kind: 'revalidation',
          summary: 'Revalidation events enqueued',
          count: result.revalidation.eventCount,
        }),
      ],
      details: {
        publicRoutes: result.publicRoutes,
        publicDescendantRoutes: result.publicDescendantRoutes,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        inboundRelations: result.inboundRelations,
        assetImpact: result.assetImpact,
        discoveryImpact: result.discoveryImpact,
        redirects: result.redirects,
        revalidation: result.revalidation,
      },
      confirm: {
        operationId: 'ginko-cms.archive-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
          discoveryImpact: result.discoveryImpact,
          redirects: result.redirects,
          assetImpact: result.assetImpact,
          revalidation: result.revalidation,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        status: entry.lifecycle,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        publicDescendantRouteCount: result.publicDescendantRoutes.length,
        assetFence: result.assetImpact.fence,
        redirectFence: result.redirects.fence,
        revalidationFence: result.revalidation.fence,
      },
    })
  },
  handler: async (ctx, args, { entry, collection, destructivePreview }) => {
    const appIdentity = await ctx.appIdentity()
    await archiveCurrentEntry(ctx, {
      entryId: entry._id,
      expectedPublicRevisionIds: destructivePreview.publicRevisionIdsByLocale,
      appIdentity: appIdentity.userId,
    })
    void collection
    return null
  },
})

export const archiveEntryOperationExecute = callerMutation.protected(archiveEntryOperation)
export const previewArchiveEntryOperation = callerMutation.protected(
  Object.assign(definePreview(archiveEntryOperation), {
    id: 'entries/publish:previewArchiveEntryOperation',
  }),
)

export const restoreEntryOperation = defineCmsOperation({
  id: 'ginko-cms.restore-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:restoreEntryOperationExecute',
  args: restoreEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(ctx, args.entryId))
    if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
    const collection = await getCollectionForEntry(ctx, entry)
    return {
      entry,
      eligibility: await inspectRestoreEligibility(ctx, entry, collection),
    }
  },
  preview: async (_ctx, args, { entry, eligibility }) => {
    const archived = entry.lifecycle === 'archived'
    const blockers = [
      ...(archived
        ? []
        : [
            operationIssue({
              code: 'not-archived',
              message: 'Only archived entries can be restored.',
            }),
          ]),
      ...eligibility.blockers.map((issue: RestoreEligibilityIssue) => operationIssue(issue)),
    ]
    return buildPreview({
      summary:
        archived && blockers.length === 0
          ? `Will restore "${entry.slug}" to the active editorial workspace without publishing it.`
          : archived
            ? `Entry "${entry.slug}" cannot be restored until its conflicts are resolved.`
            : `Entry "${entry.slug}" is already active.`,
      allowed: archived && blockers.length === 0,
      blockers,
      warnings: archived
        ? [
            operationIssue({
              code: 'remains-unpublished',
              message: 'Restoring the editorial record does not restore public output.',
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'entries',
          summary: 'Editorial records restored',
          count: archived ? 1 : 0,
        }),
      ],
      details: {
        locales: eligibility.locales,
        relationCount: eligibility.relationCount,
        assetCount: eligibility.assetCount,
      },
      confirm: {
        operationId: 'ginko-cms.restore-entry',
        args,
        lifecycle: entry.lifecycle,
      },
      version: {
        draftVersion: entry.draftVersion,
        lifecycle: entry.lifecycle,
        eligibility,
      },
    })
  },
  handler: async (ctx, _args, { entry }) => {
    const appIdentity = await ctx.appIdentity()
    await restoreArchivedEntry(ctx, {
      entryId: entry._id,
      expectedDraftVersion: entry.draftVersion,
      appIdentity: appIdentity.userId,
    })
    return null
  },
})

export const restoreEntryOperationExecute = callerMutation.protected(restoreEntryOperation)
export const previewRestoreEntryOperation = callerMutation.protected(
  Object.assign(definePreview(restoreEntryOperation), {
    id: 'entries/publish:previewRestoreEntryOperation',
  }),
)

export const createCheckpoint = callerMutation.protected({
  id: 'editor:createCheckpoint',
  args: createCheckpointArgs.args,
  guard: canEditEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const { appIdentityId, entry } = await loadEntryMutationContext(ctx, args.entryId)
    const revisionId = await createDraftCheckpoint(ctx, {
      entryId: entry._id,
      appIdentity: appIdentityId,
      message: args.message ?? null,
    })
    return String(revisionId)
  },
})
