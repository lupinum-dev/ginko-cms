import {
  renderGinkoHref,
  validateGinkoRouteClaims,
  type GinkoRoutingLocale,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Doc } from '../_generated/dataModel.js'
import { readStudioDraftView } from '../entries/context.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  getCollectionDefaultLocale,
  getCollectionMode,
} from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { getRoutingLocales } from '../lib/locale.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'
import {
  diagnostic,
  getPublicRowForEntryLocale,
  missingDraftRequiredFieldsForData,
  relationDiagnosticsForData,
  resolvePrimaryStatus,
  routeClaimsAtRenderedHref,
  routeDiagnosticsForEntry,
  type PublicRouteRow,
  type VisibilityDiagnostic,
  type VisibilityStatus,
} from './shared.js'

async function buildLocaleVisibility(args: {
  ctx: QueryOrMutationCtx
  collection: CmsCollection
  entryId: string
  entryLifecycle: Doc<'entries'>['lifecycle']
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
  const hasProjection = !!args.publicRow
  const isPublished = hasProjection && !!path
  statuses.add(isPublished ? 'public' : 'excluded')

  if (args.entryLifecycle === 'archived' && !isPublished) {
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
  } else if (hasProjection && !path) {
    statuses.add('parent_not_public')
    reasons.push('The publication is unreachable because its public parent is unavailable.')
    diagnostics.push(
      diagnostic({
        code: 'missing_parent_route',
        severity: 'error',
        collection: args.collection.slug,
        entryId: args.entryId,
        locale: args.locale,
        details: {
          parentEntryId: args.publicRow?.parentEntryId
            ? toStringId(args.publicRow.parentEntryId)
            : null,
          parentPath: null,
        },
        message: `Locale "${args.locale}" has a publication row but is unreachable through the public tree.`,
      }),
    )
  } else if (!hasProjection) {
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
    if (!parentRow?.path) {
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

  if (!isPublished) {
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
    sitemap:
      isPublished && args.publicRow?.sitemapIncluded !== false
        ? ('included' as const)
        : ('excluded' as const),
    search:
      isPublished && args.publicRow?.searchIncluded !== false
        ? ('included' as const)
        : ('excluded' as const),
    nav:
      isPublished && args.publicRow?.navIncluded !== false
        ? ('included' as const)
        : ('excluded' as const),
    reasons,
    missingRequiredFields,
    secondaryStatuses: [...statuses].filter((item) => item !== status),
    diagnostics,
  }
}

export async function explainPublicVisibilityForEntry(
  ctx: QueryOrMutationCtx,
  args: { collection: string; entryId: string; locale?: string },
) {
  const collection = await getCollection(ctx, args.collection)
  const entryId = args.entryId
  const parsedEntryId = ctx.db.normalizeId('entries', entryId)
  const entry = parsedEntryId ? await ctx.db.get(parsedEntryId) : null
  const diagnostics: VisibilityDiagnostic[] = []

  if (!collection || !entry) {
    return {
      collection: args.collection,
      entryId,
      mode: 'none' as const,
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

  if (entry.collection !== collection.slug) {
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
    const routeDiagnostics = publicRow?.href
      ? validateGinkoRouteClaims(
          await routeClaimsAtRenderedHref(ctx, publicRow.href),
          activeRoutingLocales,
        )
      : []
    const result = await buildLocaleVisibility({
      ctx,
      collection,
      entryId,
      entryLifecycle: entry.lifecycle,
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
}
