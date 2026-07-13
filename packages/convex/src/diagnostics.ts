import {
  explainPublicVisibility as explainPublicVisibilityArgs,
  previewPublishImpact as previewPublishImpactArgs,
  validatePublicRoutes as validatePublicRoutesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'
import {
  ginkoPublicVisibilityExplanationValidator,
  ginkoPublishImpactResultValidator,
  ginkoRouteDiagnosticValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import {
  renderGinkoHref,
  validateGinkoRouteClaims,
  type GinkoRouteClaim,
  type GinkoRoutingLocale,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { canManageSettings, canRead } from './auth/checks.js'
import { readStudioDraftView } from './entries/context.js'
import { collectRelationReferences } from './entries/relations.js'
import { readDraftRows } from './entries/workflow/drafts.js'
import {
  entrySnapshotPath,
  localeSnapshotPathFromPublicPath,
  pathSegments,
  publicPathForLocaleSnapshot,
} from './entries/workflow/path.js'
import {
  collectPublishedDescendantRouteChanges,
  type PublishedDescendantRouteChange,
} from './entries/workflow/subtreeRoutes.js'
import { callerQuery } from './functions.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  getCollectionDefaultLocale,
  getCollectionMode,
  isRouteBackedCollection,
} from './lib/collections.js'
import { isEqualJsonValue } from './lib/data.js'
import { asEntryId, toStringId } from './lib/ids.js'
import { getRoutingLocales } from './lib/locale.js'
import type { CmsCollection, QueryOrMutationCtx } from './lib/types.js'
import { collectPublishRequiredFieldIssues } from './lib/validation.js'

type PublicRouteRow = Pick<
  Doc<'publicEntries'>,
  | 'entryId'
  | 'collectionId'
  | 'locale'
  | 'path'
  | 'href'
  | 'parentEntryId'
  | 'revisionId'
  | 'title'
  | 'data'
>
type VisibilityDiagnostic =
  (typeof ginkoPublicVisibilityExplanationValidator.type)['diagnostics'][number]
type VisibilityStatus =
  (typeof ginkoPublicVisibilityExplanationValidator.type)['locales'][number]['status']
type PublishImpactResult = typeof ginkoPublishImpactResultValidator.type
type PublishImpactLocale = PublishImpactResult['locales'][number]
type PublishImpactChange = PublishImpactResult['changes'][number]

function collectionSupportsStableRedirect(
  collection: Pick<Doc<'collections'>, 'routing'>,
): boolean {
  const slugMode = collection.routing?.slugMode ?? 'shared'
  return slugMode === 'stable' || slugMode === 'localizedStable'
}

const STATUS_PRIORITY: VisibilityStatus[] = [
  'archived',
  'collision',
  'parent_not_public',
  'missing_required_fields',
  'missing_route',
  'draft_only',
  'excluded',
  'public',
]

function resolvePrimaryStatus(statuses: Set<VisibilityStatus>): VisibilityStatus {
  for (const status of STATUS_PRIORITY) {
    if (statuses.has(status)) return status
  }
  return 'excluded'
}

async function buildRouteClaims(ctx: QueryOrMutationCtx) {
  const collections = await ctx.db.query('collections').collect()
  const claims: GinkoRouteClaim[] = []
  const claimKeys = new Set<string>()
  const localeCodes: string[] = []
  const collectionSlugById = new Map(
    collections.map((collection) => [toStringId(collection._id), collection.slug]),
  )

  const pushClaim = (claim: GinkoRouteClaim) => {
    const key = `${claim.kind}:${claim.collection}:${claim.entryId}:${claim.locale}:${claim.path}:${claim.targetPath ?? ''}`
    if (claimKeys.has(key)) return
    claimKeys.add(key)
    claims.push(claim)
  }

  for (const collectionDoc of collections) {
    const collection = await getCollection(ctx, collectionDoc.slug)
    if (!collection || !isRouteBackedCollection(collection)) continue
    for (const locale of collection.locales) {
      if (!localeCodes.includes(locale)) localeCodes.push(locale)
    }
    const rows = await Promise.all(
      collection.locales.map((locale) =>
        ctx.db
          .query('publicRoutes')
          .filter((q) =>
            q.and(q.eq(q.field('collectionId'), collection._id), q.eq(q.field('locale'), locale)),
          )
          .collect(),
      ),
    )

    for (const row of rows.flat()) {
      pushClaim({
        kind: 'route',
        collection: collection.slug,
        entryId: toStringId(row.entryId),
        locale: row.locale,
        path: row.path,
        href: row.href,
      })
    }
  }

  const redirects = await ctx.db.query('redirects').collect()
  for (const redirect of redirects) {
    const collection = redirect.collectionId ? await ctx.db.get(redirect.collectionId) : null
    const routingLocales = await getRoutingLocales(
      ctx,
      collection?.locales ?? localeCodes,
      collection ? getCollectionDefaultLocale(collection) : undefined,
    )
    pushClaim({
      kind: 'redirect',
      collection: redirect.collectionId
        ? (collectionSlugById.get(toStringId(redirect.collectionId)) ?? 'redirects')
        : 'redirects',
      entryId: redirect.entryId ? toStringId(redirect.entryId) : redirect.from,
      locale: redirect.locale,
      path: redirect.from,
      href: renderGinkoHref({ locale: redirect.locale, path: redirect.from }, routingLocales),
      targetPath: redirect.to,
      targetHref: renderGinkoHref({ locale: redirect.locale, path: redirect.to }, routingLocales),
    })
    if (!localeCodes.includes(redirect.locale)) localeCodes.push(redirect.locale)
  }

  return { claims, locales: await getRoutingLocales(ctx, localeCodes) }
}

function diagnostic(args: {
  code: VisibilityDiagnostic['code']
  severity: VisibilityDiagnostic['severity']
  collection: string
  entryId?: string | null
  locale?: string | null
  path?: string | null
  href?: string | null
  details?: VisibilityDiagnostic['details']
  message: string
}): VisibilityDiagnostic {
  return {
    code: args.code,
    severity: args.severity,
    collection: args.collection,
    entryId: args.entryId ?? null,
    locale: args.locale ?? null,
    path: args.path ?? null,
    href: args.href ?? null,
    details: args.details ?? null,
    message: args.message,
  }
}

function parseEntryId(value: string): Id<'entries'> | null {
  try {
    return asEntryId(value)
  } catch {
    return null
  }
}

function missingDraftRequiredFieldsForData(args: {
  collection: CmsCollection
  draftData: Record<string, unknown> | null | undefined
}) {
  if (!args.draftData) return []
  return collectPublishRequiredFieldIssues({
    collection: args.collection,
    localizedValues: args.draftData,
    sharedValues: args.draftData,
    data: args.draftData,
  }).map((error) => error.field)
}

async function relationDiagnosticsForData(args: {
  ctx: QueryOrMutationCtx
  collection: CmsCollection
  entryId: string
  locale: string
  path: string | null
  href: string | null
  data: Record<string, unknown>
}) {
  const diagnostics: VisibilityDiagnostic[] = []
  const collectionCache = new Map<string, CmsCollection | null>()

  for (const reference of collectRelationReferences({
    fields: args.collection.fields,
    data: args.data,
  })) {
    const targetCollectionSlug = reference.targetCollectionSlug
    if (!targetCollectionSlug) continue
    let targetCollection = collectionCache.get(targetCollectionSlug)
    if (!collectionCache.has(targetCollectionSlug)) {
      targetCollection = await getCollection(args.ctx, targetCollectionSlug)
      collectionCache.set(targetCollectionSlug, targetCollection)
    }
    if (!targetCollection) {
      diagnostics.push(
        diagnostic({
          code: 'broken_relation',
          severity: 'warning',
          collection: args.collection.slug,
          entryId: args.entryId,
          locale: args.locale,
          path: args.path,
          href: args.href,
          details: {
            relationField: reference.fieldPath,
            targetCollection: targetCollectionSlug,
            targetId: reference.targetId,
          },
          message: `Relation field "${reference.fieldPath}" targets missing collection "${targetCollectionSlug}".`,
        }),
      )
      continue
    }

    const target = await args.ctx.db
      .query('entries')
      .withIndex('by_collection_stableId', (q) =>
        q.eq('collectionId', targetCollection._id).eq('stableId', reference.targetId),
      )
      .first()
    if (target) continue
    const targetByEntryId = await args.ctx.db.get(asEntryId(reference.targetId))
    if (targetByEntryId?.collectionId === targetCollection._id) continue
    diagnostics.push(
      diagnostic({
        code: 'broken_relation',
        severity: 'warning',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        path: args.path,
        href: args.href,
        details: {
          relationField: reference.fieldPath,
          targetCollection: targetCollectionSlug,
          targetId: reference.targetId,
        },
        message: `Relation field "${reference.fieldPath}" points to missing ${targetCollectionSlug} entry "${reference.targetId}".`,
      }),
    )
  }
  return diagnostics
}

async function getPublicRowForEntryLocale(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
): Promise<PublicRouteRow | null> {
  return await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
    .first()
}

function routeDiagnosticsForEntry(args: {
  diagnostics: ReturnType<typeof validateGinkoRouteClaims>
  entryId: string
  locale: string
  collection: string
}) {
  return args.diagnostics.filter((item) =>
    item.claims.some(
      (claim) =>
        claim.entryId === args.entryId &&
        claim.locale === args.locale &&
        claim.collection === args.collection,
    ),
  )
}

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

async function computePublishedAncestorSlugsForPreview(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Doc<'collections'> | null
    parentEntryId: Id<'entries'> | null
    locale: string
  },
): Promise<string[]> {
  if (!args.parentEntryId) return []

  const parentPublic = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) =>
      q.eq('entryId', args.parentEntryId!).eq('locale', args.locale),
    )
    .first()
  if (!parentPublic) {
    const parent = await ctx.db.get(args.parentEntryId)
    return parent ? [parent.baseSlug] : []
  }

  return pathSegments(
    localeSnapshotPathFromPublicPath(args.collection, parentPublic.path, args.locale),
  )
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

async function buildLocaleVisibility(args: {
  ctx: QueryOrMutationCtx
  collection: CmsCollection
  entryId: string
  entryStatus: Doc<'entries'>['status']
  locale: string
  draftLocale: Awaited<ReturnType<typeof readStudioDraftView>>['locales'][number] | undefined
  publicRow: PublicRouteRow | null
  locales: GinkoRoutingLocale[]
  routeDiagnostics: ReturnType<typeof validateGinkoRouteClaims>
}) {
  const reasons: string[] = []
  const diagnostics: VisibilityDiagnostic[] = []
  const statuses = new Set<VisibilityStatus>()
  const path = args.publicRow?.path ?? args.draftLocale?.publishedPath ?? null
  const href = path ? renderGinkoHref({ locale: args.locale, path }, args.locales) : null
  const isPublished = !!args.publicRow
  statuses.add(args.publicRow ? 'public' : 'excluded')

  if (args.entryStatus === 'archived' && !isPublished) {
    statuses.add('archived')
    reasons.push('Entry is archived and intentionally excluded from public reads.')
    diagnostics.push(
      diagnostic({
        code: 'archived_entry',
        severity: 'info',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        path: args.draftLocale?.draftPath,
        href: args.draftLocale?.draftPath
          ? renderGinkoHref({ locale: args.locale, path: args.draftLocale.draftPath }, args.locales)
          : null,
        message: `Entry is archived; locale "${args.locale}" is intentionally not public.`,
      }),
    )
  } else if (!args.draftLocale) {
    statuses.add('missing_route')
    reasons.push('No locale variant exists.')
    diagnostics.push(
      diagnostic({
        code: 'missing_locale_route',
        severity: 'error',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        message: `Entry has no "${args.locale}" locale variant.`,
      }),
    )
  } else if (!isPublished) {
    statuses.add(args.draftLocale.draftPath ? 'draft_only' : 'missing_route')
    reasons.push('Locale is not published.')
    diagnostics.push(
      diagnostic({
        code: 'unpublished_entry',
        severity: 'warning',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        path: args.draftLocale.draftPath,
        href: renderGinkoHref(
          { locale: args.locale, path: args.draftLocale.draftPath },
          args.locales,
        ),
        message: `Locale "${args.locale}" is draft-only and is excluded from public reads.`,
      }),
    )
  } else if (!args.publicRow) {
    statuses.add('missing_route')
    reasons.push('Published locale has no public route projection.')
    diagnostics.push(
      diagnostic({
        code: 'missing_locale_route',
        severity: 'error',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        path,
        href,
        message: `Locale "${args.locale}" is published but has no public route row.`,
      }),
    )
  }

  const publishedData = args.publicRow ? (args.publicRow.data as Record<string, unknown>) : null
  const missingRequiredFields = publishedData
    ? missingDraftRequiredFieldsForData({ collection: args.collection, draftData: publishedData })
    : []
  if (isPublished && missingRequiredFields.length > 0) {
    statuses.add('missing_required_fields')
    reasons.push('Required localized fields are missing or invalid.')
    for (const field of missingRequiredFields) {
      diagnostics.push(
        diagnostic({
          code: 'missing_required_localized_field',
          severity: 'error',
          collection: args.collection.slug,
          entryId: args.entryId,
          locale: args.locale,
          path,
          href,
          details: { fields: [field] },
          message: `Required field "${field}" is missing or invalid for locale "${args.locale}".`,
        }),
      )
    }
  }
  if (isPublished && publishedData) {
    diagnostics.push(
      ...(await relationDiagnosticsForData({
        ctx: args.ctx,
        collection: args.collection,
        entryId: args.entryId,
        locale: args.locale,
        path,
        href,
        data: publishedData,
      })),
    )
  }

  if (args.publicRow?.parentEntryId) {
    const parentRow = await getPublicRowForEntryLocale(
      args.ctx,
      args.publicRow.parentEntryId,
      args.locale,
    )
    if (!parentRow) {
      statuses.add('parent_not_public')
      reasons.push('Parent entry is not public in this locale.')
      diagnostics.push(
        diagnostic({
          code: 'missing_parent_route',
          severity: 'error',
          collection: args.collection.slug,
          entryId: args.entryId,
          locale: args.locale,
          path,
          href,
          details: {
            parentEntryId: toStringId(args.publicRow.parentEntryId),
            parentPath: null,
          },
          message: `Parent entry is not public for locale "${args.locale}".`,
        }),
      )
    }
  }

  const collisions = routeDiagnosticsForEntry({
    diagnostics: args.routeDiagnostics,
    collection: args.collection.slug,
    entryId: args.entryId,
    locale: args.locale,
  })
  if (collisions.length > 0) {
    statuses.add('collision')
    reasons.push('Route or redirect collides with another public href.')
    diagnostics.push(
      ...collisions.map((item) =>
        diagnostic({
          code: item.code,
          severity: 'error',
          collection: args.collection.slug,
          entryId: args.entryId,
          locale: args.locale,
          path,
          href: item.href,
          details: {
            claims: item.claims,
          },
          message: item.message,
        }),
      ),
    )
  }

  if (!args.publicRow) {
    for (const code of [
      'excluded_from_sitemap',
      'excluded_from_search',
      'excluded_from_nav',
    ] as const) {
      diagnostics.push(
        diagnostic({
          code,
          severity: 'info',
          collection: args.collection.slug,
          entryId: args.entryId,
          locale: args.locale,
          path,
          href,
          message: `Entry is excluded from ${code.replace('excluded_from_', '')} because it is not public in this locale.`,
        }),
      )
    }
  }

  const status = resolvePrimaryStatus(statuses)

  return {
    locale: args.locale,
    status,
    published: isPublished,
    path,
    href,
    sitemap: args.publicRow ? ('included' as const) : ('excluded' as const),
    search: args.publicRow ? ('included' as const) : ('excluded' as const),
    nav: args.publicRow ? ('included' as const) : ('excluded' as const),
    reasons,
    missingRequiredFields,
    secondaryStatuses: [...statuses].filter((item) => item !== status),
    diagnostics,
  }
}

export const validatePublicRoutes = callerQuery.protected({
  id: 'diagnostics:validatePublicRoutes',
  args: validatePublicRoutesArgs.args,
  guard: canRead,
  returns: v.array(ginkoRouteDiagnosticValidator),
  handler: async (ctx) => {
    const { claims, locales } = await buildRouteClaims(ctx)
    return validateGinkoRouteClaims(claims, locales)
  },
})

export const explainPublicVisibility = callerQuery.protected({
  id: 'diagnostics:explainPublicVisibility',
  args: explainPublicVisibilityArgs.args,
  guard: canRead,
  returns: ginkoPublicVisibilityExplanationValidator,
  handler: async (ctx, args) => {
    const collection = await getCollection(ctx, args.collection)
    const entryId = args.entryId
    const parsedEntryId = parseEntryId(entryId)
    const entry = parsedEntryId ? await ctx.db.get(parsedEntryId) : null
    const diagnostics: VisibilityDiagnostic[] = []

    if (!collection || !entry) {
      return {
        collection: args.collection,
        entryId,
        mode: 'none',
        locales: [],
        diagnostics: [
          diagnostic({
            code: !entry ? 'invalid_entry_id' : 'missing_locale_route',
            severity: 'error',
            collection: args.collection,
            entryId,
            message: !collection
              ? `Collection "${args.collection}" does not exist.`
              : `Entry "${entryId}" does not exist.`,
          }),
        ],
      }
    }

    if (String(entry.collectionId) !== String(collection._id)) {
      return {
        collection: collection.slug,
        entryId,
        mode: getCollectionMode(collection),
        locales: [],
        diagnostics: [
          diagnostic({
            code: 'entry_collection_mismatch',
            severity: 'error',
            collection: collection.slug,
            entryId,
            message: `Entry "${entryId}" does not belong to collection "${collection.slug}".`,
          }),
        ],
      }
    }

    if (args.locale) {
      assertCollectionSupportsLocale(collection, args.locale)
    }

    const mode = getCollectionMode(collection)
    if (mode === 'none') {
      const draftView = await readStudioDraftView(ctx, entry, collection)
      const localeResults = collection.locales.map((locale) => {
        const draftLocale = draftView.locales.find((item) => item.locale === locale)
        const missingRequiredFields = missingDraftRequiredFieldsForData({
          collection,
          draftData: draftLocale?.publishedData,
        })
        return {
          locale,
          status: 'excluded' as const,
          published: !!draftLocale?.published,
          path: null,
          href: null,
          sitemap: 'excluded' as const,
          search: 'excluded' as const,
          nav: 'excluded' as const,
          reasons: ['Collection is data-only.'],
          missingRequiredFields,
          secondaryStatuses: [] as string[],
        }
      })
      const missingFieldDiagnostics = localeResults.flatMap((localeState) =>
        localeState.missingRequiredFields.map((field) =>
          diagnostic({
            code: 'missing_required_localized_field',
            severity: 'warning',
            collection: collection.slug,
            entryId,
            locale: localeState.locale,
            details: { fields: [field] },
            message: `Required field "${field}" is missing or invalid for data-only locale "${localeState.locale}".`,
          }),
        ),
      )
      const relationDiagnostics = (
        await Promise.all(
          collection.locales.map(async (locale) => {
            const draftLocale = draftView.locales.find((item) => item.locale === locale)
            if (!draftLocale?.published) return []
            return await relationDiagnosticsForData({
              ctx,
              collection,
              entryId,
              locale,
              path: null,
              href: null,
              data: draftLocale.publishedData,
            })
          }),
        )
      ).flat()

      return {
        collection: collection.slug,
        entryId,
        mode,
        locales: localeResults,
        diagnostics: [
          diagnostic({
            code: 'data_only_collection',
            severity: 'info',
            collection: collection.slug,
            entryId,
            message: `Collection "${collection.slug}" is data-only: publish creates listable public data but no routes, nav, search, or sitemap output.`,
          }),
          ...missingFieldDiagnostics,
          ...relationDiagnostics,
        ],
      }
    }

    const { claims, locales: routeLocales } = await buildRouteClaims(ctx)
    const routeDiagnostics = validateGinkoRouteClaims(claims, routeLocales)
    const activeRoutingLocales = await getRoutingLocales(
      ctx,
      collection.locales,
      getCollectionDefaultLocale(collection),
    )
    const draftView = await readStudioDraftView(ctx, entry, collection)
    const requestedLocales = args.locale ? [args.locale] : collection.locales
    const localeResults = []

    for (const locale of requestedLocales) {
      const publicRow = await getPublicRowForEntryLocale(ctx, entry._id, locale)
      const result = await buildLocaleVisibility({
        ctx,
        collection,
        entryId,
        entryStatus: entry.status,
        locale,
        draftLocale: draftView.locales.find((item) => item.locale === locale),
        publicRow,
        locales: activeRoutingLocales,
        routeDiagnostics,
      })
      localeResults.push({
        locale: result.locale,
        status: result.status,
        published: result.published,
        path: result.path,
        href: result.href,
        sitemap: result.sitemap,
        search: result.search,
        nav: result.nav,
        reasons: result.reasons,
        missingRequiredFields: result.missingRequiredFields,
        secondaryStatuses: result.secondaryStatuses,
      })
      diagnostics.push(...result.diagnostics)
    }

    return {
      collection: collection.slug,
      entryId,
      mode,
      locales: localeResults,
      diagnostics,
    }
  },
})

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
  const parsedEntryId = parseEntryId(entryId)
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
  if (String(entry.collectionId) !== String(collection._id)) {
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
  const { claims } = await buildRouteClaims(ctx)
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
      const dirty = entry.dirtyLocales.includes(locale)
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
      const ancestorSlugs = await computePublishedAncestorSlugsForPreview(ctx, {
        collection,
        parentEntryId: publishParentEntryId,
        locale,
      })
      const slug = localeDraftRow.localeSlug ?? draftRows.shared?.slug ?? entry.baseSlug
      nextPath = publicPathForLocaleSnapshot(
        collection,
        entrySnapshotPath(collection, {
          slug,
          stableId: entry.stableId ?? null,
          ancestorSlugs,
        }),
        locale,
      )
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
      descendantRoutePreviews = await collectPublishedDescendantRouteChanges(ctx, {
        collection,
        rootEntry: entry,
        locale,
        currentPath,
        nextPath,
        activeRoutingLocales,
      })
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
    for (const descendant of descendantRoutePreviews) {
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
    if (
      collectionSupportsStableRedirect(collection) &&
      currentPath &&
      nextPath &&
      currentPath !== nextPath
    ) {
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

    const dirty = entry.dirtyLocales.includes(locale)
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

export const previewPublishImpact = callerQuery.protected({
  id: 'diagnostics:previewPublishImpact',
  args: previewPublishImpactArgs.args,
  guard: canRead,
  returns: ginkoPublishImpactResultValidator,
  handler: async (ctx, args) => previewPublishImpactForEntry(ctx, args),
})

const STORAGE_REPORT_SCAN_LIMIT = 1000

const storageTableCountsValidator = v.object({
  entries: v.number(),
  entryDrafts: v.number(),
  entryRevisions: v.number(),
  publicEntries: v.number(),
  contentAssetRefs: v.number(),
  outboxEvents: v.number(),
  activity: v.number(),
  collectionImportRuns: v.number(),
  backupArtifacts: v.number(),
  softDeletedAssets: v.number(),
})

const storageDistributionValidator = v.object({
  max: v.number(),
  average: v.number(),
})

function boundedRows<TRow>(rows: TRow[]) {
  return {
    rows: rows.slice(0, STORAGE_REPORT_SCAN_LIMIT),
    truncated: rows.length > STORAGE_REPORT_SCAN_LIMIT,
  }
}

function distribution(counts: Map<string, number>, denominator: number) {
  if (denominator === 0) return { max: 0, average: 0 }
  let total = 0
  let max = 0
  for (const count of counts.values()) {
    total += count
    max = Math.max(max, count)
  }
  return { max, average: total / denominator }
}

function countByEntry(rows: Array<Doc<'entryRevisions'> | Doc<'contentAssetRefs'>>) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const entryId = String(row.entryId)
    counts.set(entryId, (counts.get(entryId) ?? 0) + 1)
  }
  return counts
}

export const storageHygieneReport = callerQuery.protected({
  id: 'diagnostics:storageHygieneReport',
  args: {},
  guard: canManageSettings,
  returns: v.object({
    counts: storageTableCountsValidator,
    revisionsPerEntry: storageDistributionValidator,
    assetRefsPerEntry: storageDistributionValidator,
    outbox: v.object({
      delivered: v.number(),
      failed: v.number(),
      pending: v.number(),
      delivering: v.number(),
    }),
    backupArtifacts: v.number(),
    scanLimit: v.number(),
    truncatedTables: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const entries = boundedRows(await ctx.db.query('entries').take(STORAGE_REPORT_SCAN_LIMIT + 1))
    const entryDrafts = boundedRows(
      await ctx.db.query('entryDrafts').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const entryRevisions = boundedRows(
      await ctx.db.query('entryRevisions').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const publicEntries = boundedRows(
      await ctx.db.query('publicEntries').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const contentAssetRefs = boundedRows(
      await ctx.db.query('contentAssetRefs').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const outboxEvents = boundedRows(
      await ctx.db.query('outboxEvents').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const activity = boundedRows(await ctx.db.query('activity').take(STORAGE_REPORT_SCAN_LIMIT + 1))
    const collectionImportRuns = boundedRows(
      await ctx.db.query('collectionImportRuns').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const backupArtifacts = boundedRows(
      await ctx.db.query('backupArtifacts').take(STORAGE_REPORT_SCAN_LIMIT + 1),
    )
    const assets = boundedRows(await ctx.db.query('assets').take(STORAGE_REPORT_SCAN_LIMIT + 1))
    const truncatedTables = [
      entries.truncated ? 'entries' : null,
      entryDrafts.truncated ? 'entryDrafts' : null,
      entryRevisions.truncated ? 'entryRevisions' : null,
      publicEntries.truncated ? 'publicEntries' : null,
      contentAssetRefs.truncated ? 'contentAssetRefs' : null,
      outboxEvents.truncated ? 'outboxEvents' : null,
      activity.truncated ? 'activity' : null,
      collectionImportRuns.truncated ? 'collectionImportRuns' : null,
      backupArtifacts.truncated ? 'backupArtifacts' : null,
      assets.truncated ? 'assets' : null,
    ].filter((table): table is string => table !== null)

    return {
      counts: {
        entries: entries.rows.length,
        entryDrafts: entryDrafts.rows.length,
        entryRevisions: entryRevisions.rows.length,
        publicEntries: publicEntries.rows.length,
        contentAssetRefs: contentAssetRefs.rows.length,
        outboxEvents: outboxEvents.rows.length,
        activity: activity.rows.length,
        collectionImportRuns: collectionImportRuns.rows.length,
        backupArtifacts: backupArtifacts.rows.length,
        softDeletedAssets: assets.rows.filter((asset) => asset.deletedAt != null).length,
      },
      revisionsPerEntry: distribution(countByEntry(entryRevisions.rows), entries.rows.length),
      assetRefsPerEntry: distribution(countByEntry(contentAssetRefs.rows), entries.rows.length),
      outbox: {
        delivered: outboxEvents.rows.filter((event) => event.status === 'delivered').length,
        failed: outboxEvents.rows.filter((event) => event.status === 'failed').length,
        pending: outboxEvents.rows.filter((event) => event.status === 'pending').length,
        delivering: outboxEvents.rows.filter((event) => event.status === 'delivering').length,
      },
      backupArtifacts: backupArtifacts.rows.length,
      scanLimit: STORAGE_REPORT_SCAN_LIMIT,
      truncatedTables,
    }
  },
})
