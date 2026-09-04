import type { ginkoPublicVisibilityExplanationValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import {
  renderGinkoHref,
  type GinkoRouteClaim,
  type GinkoRoutingLocale,
  type validateGinkoRouteClaims,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { collectRelationReferences } from '../entries/relations.js'
import { publicPathForEntry, resolvePublicTreePath } from '../entries/workflow/publicTree.js'
import {
  getCollection,
  getCollectionDefaultLocale,
  isRouteBackedCollection,
  listInstalledCollections,
} from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { getRoutingLocales } from '../lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'
import { collectPublishRequiredFieldIssues } from '../lib/validation.js'

export type PublicRouteRow = Doc<'publicEntries'> & {
  path: string | null
  href: string | null
  data: JsonObject
  searchIncluded: boolean
}
export type VisibilityDiagnostic =
  (typeof ginkoPublicVisibilityExplanationValidator.type)['diagnostics'][number]
export type VisibilityStatus =
  (typeof ginkoPublicVisibilityExplanationValidator.type)['locales'][number]['status']

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

export function resolvePrimaryStatus(statuses: Set<VisibilityStatus>): VisibilityStatus {
  for (const status of STATUS_PRIORITY) {
    if (statuses.has(status)) return status
  }
  return 'excluded'
}

function pathAtRenderedHref(href: string, locale: GinkoRoutingLocale): string | null {
  const prefix = locale.prefix || ''
  if (!prefix) return href || '/'
  if (href === prefix) return '/'
  if (!href.startsWith(`${prefix}/`)) return null
  return href.slice(prefix.length) || '/'
}

export function uniqueRouteClaims(claims: GinkoRouteClaim[]): GinkoRouteClaim[] {
  const result: GinkoRouteClaim[] = []
  const keys = new Set<string>()
  for (const claim of claims) {
    const key = `${claim.kind}:${claim.collection}:${claim.entryId}:${claim.locale}:${claim.path}:${claim.href ?? ''}:${claim.targetPath ?? ''}`
    if (keys.has(key)) continue
    keys.add(key)
    result.push(claim)
  }
  return result
}

/**
 * Resolves only claims that can own one rendered href. Work is bounded by the
 * installed collection/locale contract and indexed path segments; it never
 * scans public rows or redirects.
 */
export async function routeClaimsAtRenderedHref(ctx: QueryOrMutationCtx, href: string) {
  const collections = await listInstalledCollections(ctx)
  const claims: GinkoRouteClaim[] = []

  for (const collection of collections) {
    if (!isRouteBackedCollection(collection)) continue
    const routingLocales = await getRoutingLocales(
      ctx,
      collection.locales,
      getCollectionDefaultLocale(collection),
    )
    for (const locale of collection.locales) {
      const routingLocale = routingLocales.find((candidate) => candidate.code === locale)
      if (!routingLocale) continue
      const path = pathAtRenderedHref(href, routingLocale)
      if (!path) continue
      const options = {
        pathPrefix: pathPrefixForLocale(collection, locale),
        rootSlug: rootSlugForLocale(collection, locale),
      }
      const route = await resolvePublicTreePath(ctx, {
        collection: collection.slug,
        locale,
        path,
        options,
      })
      if (route) {
        claims.push({
          kind: 'route',
          collection: collection.slug,
          entryId: toStringId(route.row.entryId),
          locale,
          path: route.path,
          href,
        })
      }

      const redirects = await ctx.db
        .query('redirects')
        .withIndex('by_collection_locale_state_from', (query) =>
          query
            .eq('collection', collection.slug)
            .eq('locale', locale)
            .eq('state', 'active')
            .eq('fromPath', path),
        )
        .take(3)
      for (const redirect of redirects) {
        const targetRow = await getPublicRowForEntryLocale(
          ctx,
          redirect.targetEntryId,
          redirect.locale,
        )
        const targetPath = targetRow?.path ?? null
        const targetHref = targetPath
          ? renderGinkoHref({ locale, path: targetPath }, routingLocales)
          : null
        claims.push({
          kind: 'redirect',
          collection: collection.slug,
          entryId: toStringId(redirect.targetEntryId),
          locale,
          path: redirect.fromPath,
          href,
          targetPath,
          targetHref,
        })
        if (targetRow?.path && targetHref) {
          claims.push({
            kind: 'route',
            collection: collection.slug,
            entryId: toStringId(targetRow.entryId),
            locale,
            path: targetRow.path,
            href: targetHref,
          })
        }
      }
    }
  }

  return uniqueRouteClaims(claims)
}

export function diagnostic(args: {
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

export function missingDraftRequiredFieldsForData(args: {
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

export async function relationDiagnosticsForData(args: {
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
      .withIndex('by_collection_stableId', (query) =>
        query.eq('collection', targetCollection.slug).eq('stableId', reference.targetId),
      )
      .first()
    if (target) continue
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

export async function getPublicRowForEntryLocale(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
): Promise<PublicRouteRow | null> {
  const row = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .first()
  if (!row) return null
  const searchRow = await ctx.db
    .query('publicSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .unique()
  const collection = await getCollection(ctx, row.collection)
  const searchIncluded = searchRow?.revisionId === row.revisionId
  if (!collection) {
    return { ...row, searchIncluded, path: null, href: null }
  }
  const path = await publicPathForEntry(ctx, row, {
    pathPrefix: pathPrefixForLocale(collection, locale),
    rootSlug: rootSlugForLocale(collection, locale),
  })
  const routingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )
  return {
    ...row,
    searchIncluded,
    path,
    href: path ? renderGinkoHref({ locale, path }, routingLocales) : null,
  }
}

export function routeDiagnosticsForEntry(args: {
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
