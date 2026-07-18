import type { ginkoPublishImpactResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import {
  renderGinkoHref,
  validateGinkoRouteClaims,
  type GinkoRouteClaim,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import { deriveDirtyLocales, readStudioDraftView } from '../entries/context.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import { stableHash } from '../entries/workflow/hashing.js'
import { findActiveRedirectTreePlacementCollisions } from '../entries/workflow/publicTree/redirectPlacement.js'
import {
  computeDraftPublicPathForLocale,
  paginatePublishedDescendantRouteChanges,
  type PublishedDescendantRouteChange,
} from '../entries/workflow/publishImpact.js'
import { readRouteGeneration } from '../entries/workflow/routeGeneration.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  getCollectionDefaultLocale,
  getCollectionMode,
} from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { toStringId } from '../lib/ids.js'
import { getRoutingLocales } from '../lib/locale.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import {
  diagnostic,
  getPublicRowForEntryLocale,
  missingDraftRequiredFieldsForData,
  relationDiagnosticsForData,
  routeClaimsAtRenderedHref,
  uniqueRouteClaims,
  type VisibilityDiagnostic,
} from './shared.js'

type PublishImpactResult = typeof ginkoPublishImpactResultValidator.type
type PublishImpactLocale = PublishImpactResult['locales'][number]
type PublishImpactChange = PublishImpactResult['changes'][number]

function statusFromLocaleImpacts(locales: PublishImpactLocale[]): PublishImpactResult['status'] {
  if (locales.length === 0) return 'not_publishable'
  if (locales.some((locale) => locale.status === 'blocked')) return 'blocked'
  if (locales.every((locale) => locale.status === 'not_publishable')) return 'not_publishable'
  if (locales.every((locale) => locale.status === 'no_changes')) return 'no_changes'
  return 'ready'
}

function change(args: PublishImpactChange): PublishImpactChange {
  return args
}

function cacheTagsFor(args: { collection: string; publicEntryKey: string; locales: string[] }) {
  const tags = [
    contentTags.collection(args.collection),
    contentTags.entry(args.collection, args.publicEntryKey),
  ]
  for (const locale of args.locales) {
    tags.push(contentTags.entry(args.collection, args.publicEntryKey, locale))
    tags.push(contentTags.nav(args.collection, locale))
    tags.push(contentTags.search(locale))
    tags.push(contentTags.sitemap())
  }
  return uniqueContentTags(tags).sort()
}

function publishEventsFor(locales: PublishImpactLocale[]) {
  return locales.some((locale) => locale.status === 'ready') ? ['entry.published'] : []
}

function isBlockingDiagnostic(diagnostic: VisibilityDiagnostic) {
  return diagnostic.severity === 'error'
}

function replaceRouteClaimsForPreview(args: {
  claims: GinkoRouteClaim[]
  collection: string
  entryId: string
  locale: string
  currentPath: string | null
  nextPath: string | null
  stableId: string | null
}) {
  const filtered = args.claims.filter(
    (claim) =>
      !(
        claim.collection === args.collection &&
        claim.entryId === args.entryId &&
        claim.locale === args.locale
      ),
  )
  if (!args.nextPath) return filtered
  filtered.push({
    kind: 'route',
    collection: args.collection,
    entryId: args.entryId,
    locale: args.locale,
    path: args.nextPath,
  })
  if (args.currentPath && args.currentPath !== args.nextPath) {
    filtered.push({
      kind: 'redirect',
      collection: args.collection,
      entryId: args.entryId,
      locale: args.locale,
      path: args.currentPath,
      targetPath: args.nextPath,
    })
  } else if (args.stableId && args.nextPath.endsWith(`-${args.stableId}`)) {
    filtered.push({
      kind: 'redirect',
      collection: args.collection,
      entryId: args.entryId,
      locale: args.locale,
      path: args.nextPath.replace(new RegExp(`-${args.stableId}$`), ''),
      targetPath: args.nextPath,
    })
  }
  return filtered
}

function replaceDescendantRouteClaimsForPreview(
  claims: GinkoRouteClaim[],
  args: { collection: string; locale: string; descendants: PublishedDescendantRouteChange[] },
) {
  if (args.descendants.length === 0) return claims
  const affected = new Set(args.descendants.map((descendant) => descendant.entryId))
  const filtered = claims.filter(
    (claim) =>
      !(
        claim.kind === 'route' &&
        claim.collection === args.collection &&
        claim.locale === args.locale &&
        affected.has(claim.entryId)
      ),
  )
  for (const descendant of args.descendants) {
    filtered.push({
      kind: 'route',
      collection: args.collection,
      entryId: descendant.entryId,
      locale: args.locale,
      path: descendant.nextPath,
    })
  }
  return filtered
}

function routeDiagnosticsForAffectedClaims(args: {
  diagnostics: ReturnType<typeof validateGinkoRouteClaims>
  collection: string
  locale: string
  entryIds: Set<string>
}) {
  return args.diagnostics.filter((item) =>
    item.claims.some(
      (claim) =>
        claim.collection === args.collection &&
        claim.locale === args.locale &&
        args.entryIds.has(claim.entryId),
    ),
  )
}

export async function previewPublishImpactForEntry(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    entryId: string
    locale?: string
    locales?: string[]
  },
): Promise<PublishImpactResult> {
  const collection = await getCollection(ctx, args.collection)
  const entryId = args.entryId
  const parsedEntryId = ctx.db.normalizeId('entries', entryId)
  const entry = parsedEntryId ? await ctx.db.get(parsedEntryId) : null
  if (!collection || !entry) {
    const diagnostics = [
      diagnostic({
        code: !entry ? 'invalid_entry_id' : 'missing_locale_route',
        severity: 'error',
        collection: args.collection,
        entryId,
        message: !collection
          ? `Collection "${args.collection}" does not exist.`
          : `Entry "${entryId}" does not exist.`,
      }),
    ]
    return {
      collection: args.collection,
      entryId,
      status: 'not_publishable',
      mode: 'none',
      locales: [],
      blockingDiagnostics: diagnostics,
      warnings: [],
      changes: [],
      cacheTags: [],
      events: [],
    }
  }

  const mode = getCollectionMode(collection)
  if (entry.collection !== collection.slug) {
    const diagnostics = [
      diagnostic({
        code: 'entry_collection_mismatch',
        severity: 'error',
        collection: collection.slug,
        entryId,
        message: `Entry "${entryId}" does not belong to collection "${collection.slug}".`,
      }),
    ]
    return {
      collection: collection.slug,
      entryId,
      status: 'not_publishable',
      mode,
      locales: [],
      blockingDiagnostics: diagnostics,
      warnings: [],
      changes: [],
      cacheTags: [],
      events: [],
    }
  }

  const draftRows = await readDraftRows(ctx, entry._id)
  const draftView = await readStudioDraftView(ctx, entry, collection)
  const dirtyLocales = deriveDirtyLocales(
    entry,
    new Map(Object.values(draftRows.byLocale).map((row) => [row.locale, row.version])),
  )
  const publishParentEntryId =
    draftRows.shared && draftRows.shared.parentEntryId !== undefined
      ? (draftRows.shared.parentEntryId ?? null)
      : (entry.parentEntryId ?? null)
  const requestedLocales = args.locales?.length ? args.locales : args.locale ? [args.locale] : []
  const targetLocales = requestedLocales.length
    ? requestedLocales
    : collection.locales.filter((locale) =>
        draftView.locales.some((entryLocale) => entryLocale.locale === locale),
      )
  for (const locale of targetLocales) {
    assertCollectionSupportsLocale(collection, locale)
  }
  const activeRoutingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )

  const localeImpacts: PublishImpactLocale[] = []
  for (const locale of targetLocales) {
    const localeDraftRow = draftRows.byLocale[locale] ?? null
    const draftLocale = draftView.locales.find((item) => item.locale === locale)
    const publicRow = await getPublicRowForEntryLocale(ctx, entry._id, locale)
    const currentPath = publicRow?.path ?? draftLocale?.publishedPath ?? null
    const currentHref = currentPath
      ? renderGinkoHref({ locale, path: currentPath }, activeRoutingLocales)
      : null
    const currentIncluded = !!publicRow
    const blockingDiagnostics: VisibilityDiagnostic[] = []
    const warnings: VisibilityDiagnostic[] = []
    const changes: PublishImpactChange[] = []
    let descendantRoutePreviews: PublishedDescendantRouteChange[] = []
    const routeGeneration = await readRouteGeneration(ctx, collection.slug, locale)
    let routeImpact: PublishImpactLocale['routeImpact'] = {
      total: 0,
      listed: 0,
      hasMore: false,
      continueCursor: null,
      routeGeneration,
      impactHash: `routes:${stableHash([])}`,
    }

    if (mode === 'none') {
      const missingFields = missingDraftRequiredFieldsForData({
        collection,
        draftData: draftLocale?.data,
      })
      if (!localeDraftRow) {
        blockingDiagnostics.push(
          diagnostic({
            code: 'missing_locale_route',
            severity: 'error',
            collection: collection.slug,
            entryId,
            locale,
            message: `Entry has no "${locale}" locale variant to publish.`,
          }),
        )
      }
      warnings.push(
        diagnostic({
          code: 'data_only_collection',
          severity: 'info',
          collection: collection.slug,
          entryId,
          locale,
          message: `Collection "${collection.slug}" is data-only; publishing updates listable public data but does not create route, sitemap, search, or nav output.`,
        }),
      )
      for (const field of missingFields) {
        blockingDiagnostics.push(
          diagnostic({
            code: 'missing_required_localized_field',
            severity: 'error',
            collection: collection.slug,
            entryId,
            locale,
            details: { fields: [field] },
            message: `Required field "${field}" is missing or invalid for data-only locale "${locale}".`,
          }),
        )
      }
      const dirty = dirtyLocales.includes(locale)
      const noChanges =
        currentIncluded &&
        !dirty &&
        !!draftLocale &&
        !!publicRow &&
        isEqualJsonValue(draftLocale.data, publicRow.data)
      localeImpacts.push({
        locale,
        status: blockingDiagnostics.some(isBlockingDiagnostic)
          ? 'blocked'
          : noChanges
            ? 'no_changes'
            : 'ready',
        currentPath: null,
        nextPath: null,
        currentHref: null,
        nextHref: null,
        sitemap: { before: false, after: false },
        search: { before: false, after: false },
        nav: { before: false, after: false },
        routeImpact,
        changes,
        blockingDiagnostics,
        warnings,
      })
      continue
    }

    if (!localeDraftRow) {
      blockingDiagnostics.push(
        diagnostic({
          code: 'missing_locale_route',
          severity: 'error',
          collection: collection.slug,
          entryId,
          locale,
          message: `Entry has no "${locale}" locale variant to publish.`,
        }),
      )
    }

    const missingFields = missingDraftRequiredFieldsForData({
      collection,
      draftData: draftLocale?.data,
    })
    for (const field of missingFields) {
      blockingDiagnostics.push(
        diagnostic({
          code: 'missing_required_localized_field',
          severity: 'error',
          collection: collection.slug,
          entryId,
          locale,
          details: { fields: [field] },
          message: `Required field "${field}" is missing or invalid in the draft for locale "${locale}".`,
        }),
      )
    }
    if (draftLocale) {
      warnings.push(
        ...(await relationDiagnosticsForData({
          ctx,
          collection,
          entryId,
          locale,
          path: currentPath,
          href: currentHref,
          data: draftLocale.data,
        })),
      )
    }

    let nextPath: string | null = null
    let nextHref: string | null = null
    if (draftLocale && localeDraftRow) {
      const slug = localeDraftRow.slug ?? draftRows.shared?.slug ?? entry.slug
      nextPath = await computeDraftPublicPathForLocale(ctx, {
        collection,
        entry,
        parentEntryId: publishParentEntryId,
        locale,
        slug,
      })
      nextHref = renderGinkoHref({ locale, path: nextPath }, activeRoutingLocales)
    }

    if (publishParentEntryId && nextPath) {
      const parentRow = await getPublicRowForEntryLocale(ctx, publishParentEntryId, locale)
      if (!parentRow) {
        blockingDiagnostics.push(
          diagnostic({
            code: 'missing_parent_route',
            severity: 'error',
            collection: collection.slug,
            entryId,
            locale,
            path: nextPath,
            href: nextHref,
            details: {
              parentEntryId: toStringId(publishParentEntryId),
              parentPath: null,
            },
            message: `Parent entry is not public for locale "${locale}".`,
          }),
        )
      }
    }

    if (nextPath) {
      let listedDescendantRoutePreviews: PublishedDescendantRouteChange[] = []
      if (currentHref !== nextHref) {
        const firstPage = await paginatePublishedDescendantRouteChanges(ctx, {
          collection,
          entryId: entry._id,
          locale,
          nextRootPath: nextPath,
          activeRoutingLocales,
          draftVersion: entry.draftVersion,
          routeGeneration,
          limit: 25,
        })
        descendantRoutePreviews = firstPage.page
        listedDescendantRoutePreviews = firstPage.page
        routeImpact = {
          total: firstPage.isDone ? descendantRoutePreviews.length : null,
          listed: listedDescendantRoutePreviews.length,
          hasMore: !firstPage.isDone,
          continueCursor: firstPage.continueCursor,
          routeGeneration,
          impactHash: `routes:${stableHash({
            collection: collection.slug,
            entryId,
            locale,
            draftVersion: entry.draftVersion,
            routeGeneration,
            nextRootPath: nextPath,
          })}`,
        }
      }
      const affectedHrefs = new Set(
        [
          currentHref,
          nextHref,
          ...descendantRoutePreviews.flatMap((descendant) => [
            descendant.currentHref,
            descendant.nextHref,
          ]),
        ].filter((href): href is string => !!href),
      )
      const claims = uniqueRouteClaims(
        (
          await Promise.all(
            [...affectedHrefs].map(async (href) => await routeClaimsAtRenderedHref(ctx, href)),
          )
        ).flat(),
      )
      const previewClaims = replaceRouteClaimsForPreview({
        claims,
        collection: collection.slug,
        entryId,
        locale,
        currentPath,
        nextPath,
        stableId: entry.stableId ?? null,
      })
      const previewClaimsWithSubtree = replaceDescendantRouteClaimsForPreview(previewClaims, {
        collection: collection.slug,
        locale,
        descendants: descendantRoutePreviews,
      })
      const affectedRouteEntryIds = new Set([
        entryId,
        ...descendantRoutePreviews.map((descendant) => descendant.entryId),
      ])
      const routeDiagnostics = routeDiagnosticsForAffectedClaims({
        diagnostics: validateGinkoRouteClaims(previewClaimsWithSubtree, activeRoutingLocales),
        collection: collection.slug,
        locale,
        entryIds: affectedRouteEntryIds,
      })
      blockingDiagnostics.push(
        ...routeDiagnostics.map((item) =>
          diagnostic({
            code: item.code,
            severity: 'error',
            collection: collection.slug,
            entryId,
            locale,
            path: nextPath,
            href: item.href,
            details: { claims: item.claims },
            message: item.message,
          }),
        ),
      )

      const redirectPlacementCollisions = await findActiveRedirectTreePlacementCollisions(ctx, {
        collection: collection.slug,
        locale,
        entryId: entry._id,
        currentRootPath: currentPath,
        nextRootPath: nextPath,
      })
      for (const collision of redirectPlacementCollisions) {
        const alreadyReportedExactCollision =
          collision.kind === 'source' &&
          blockingDiagnostics.some(
            (item) => item.code === 'route_redirect_collision' && item.path === collision.path,
          )
        if (alreadyReportedExactCollision) continue

        const redirectId = collision.redirect.redirectId
        const collisionHref = renderGinkoHref(
          { locale, path: collision.path },
          activeRoutingLocales,
        )
        blockingDiagnostics.push(
          diagnostic({
            code: 'route_redirect_collision',
            severity: 'error',
            collection: collection.slug,
            entryId,
            locale,
            path: collision.path,
            href: collisionHref,
            details: {
              claims: [
                {
                  kind: 'route',
                  collection: collection.slug,
                  entryId: collision.entryId,
                  locale,
                  path: collision.path,
                  href: collisionHref,
                },
                {
                  kind: 'redirect',
                  collection: collection.slug,
                  entryId: toStringId(collision.redirect.targetEntryId),
                  locale,
                  path: collision.redirect.fromPath,
                },
              ],
            },
            message:
              collision.kind === 'source'
                ? `${collision.path} is reserved by active ${collision.redirect.kind} redirect ${redirectId}. Retire the redirect before reusing this path.`
                : `${collision.path} is covered by active prefix redirect ${redirectId} at ${collision.redirect.fromPath}. Retire the redirect before reusing this path.`,
          }),
        )
      }
    }

    const routeChanged = currentPath !== nextPath
    const canPublish = blockingDiagnostics.length === 0 && !!localeDraftRow && !!nextPath
    const afterIncluded = canPublish
    if (routeChanged) {
      changes.push(
        change({
          locale,
          entryId,
          scope: 'current_entry',
          kind: 'route',
          label: 'Public route',
          before: currentHref,
          after: nextHref,
        }),
      )
    }
    for (const descendant of descendantRoutePreviews.slice(0, routeImpact.listed)) {
      changes.push(
        change({
          locale,
          entryId: descendant.entryId,
          scope: 'descendant',
          kind: 'route',
          label: `Descendant public route: ${descendant.title}`,
          before: descendant.currentHref,
          after: descendant.nextHref,
        }),
      )
    }
    if (currentPath && nextPath && currentPath !== nextPath) {
      changes.push(
        change({
          locale,
          kind: 'redirect',
          label: 'Old route redirect',
          before: currentPath,
          after: nextPath,
        }),
      )
    }
    for (const kind of ['sitemap', 'search', 'nav'] as const) {
      if (currentIncluded !== afterIncluded) {
        changes.push(
          change({
            locale,
            kind,
            label: `${kind[0]?.toUpperCase()}${kind.slice(1)} inclusion`,
            before: currentIncluded,
            after: afterIncluded,
          }),
        )
      }
    }
    if (currentHref !== nextHref) {
      changes.push(
        change({
          locale,
          kind: 'seo',
          label: 'Canonical href',
          before: currentHref,
          after: nextHref,
        }),
      )
    }

    const dirty = dirtyLocales.includes(locale)
    const status: PublishImpactLocale['status'] = blockingDiagnostics.some(isBlockingDiagnostic)
      ? 'blocked'
      : !draftLocale || !nextPath
        ? 'not_publishable'
        : !dirty && changes.length === 0 && currentIncluded
          ? 'no_changes'
          : 'ready'

    localeImpacts.push({
      locale,
      status,
      currentPath,
      nextPath,
      currentHref,
      nextHref,
      sitemap: { before: currentIncluded, after: afterIncluded },
      search: { before: currentIncluded, after: afterIncluded },
      nav: { before: currentIncluded, after: afterIncluded },
      routeImpact,
      changes,
      blockingDiagnostics,
      warnings,
    })
  }

  const blockingDiagnostics = localeImpacts.flatMap((locale) => locale.blockingDiagnostics)
  const warnings = localeImpacts.flatMap((locale) => locale.warnings)
  const changes = localeImpacts.flatMap((locale) => locale.changes)
  const status = statusFromLocaleImpacts(localeImpacts)
  return {
    collection: collection.slug,
    entryId,
    status,
    mode,
    locales: localeImpacts,
    blockingDiagnostics,
    warnings,
    changes,
    cacheTags: cacheTagsFor({
      collection: collection.slug,
      publicEntryKey: entry.stableId ?? entryId,
      locales: localeImpacts.map((locale) => locale.locale),
    }),
    events: publishEventsFor(localeImpacts),
  }
}
