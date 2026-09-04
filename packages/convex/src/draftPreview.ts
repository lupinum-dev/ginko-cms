import {
  entryStatusValidator,
  jsonValueValidator,
  publicBodyAstValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { parseMdcBody } from '@lupinum/ginko-content/cms-contract'
import { v } from 'convex/values'

import { canRead } from './auth/checks.js'
import { encodePublicToc } from './entries/bodyAstStorage.js'
import { getCollectionForEntry, getEntryOrThrow } from './entries/context.js'
import {
  computeDraftPath,
  effectiveDraftParent,
  effectiveDraftSlug,
} from './entries/workflow/draftPlacement.js'
import { readDraftRows } from './entries/workflow/drafts.js'
import { publicPathForEntry } from './entries/workflow/publicTree.js'
import { assertPublicBodySafe } from './entries/workflow/renderSafety.js'
import { throwCmsError } from './errors.js'
import { callerQuery } from './functions.js'
import { isRouteBackedCollection } from './lib/collections.js'
import { toStringId } from './lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from './lib/paths.js'
import type { HandlerQueryCtx } from './lib/types.js'

// EDT-10 draft preview (v1): a dedicated, canRead-guarded read of the CURRENT
// draft rows so an authenticated editor can see the page before publishing.
//
// Deliberate boundaries:
//   - This never reads through the public provider and never writes anything —
//     public projections, routes, and caches are untouched.
//   - No preview tokens. Access is exactly the Studio session's canRead guard;
//     transferable stakeholder links are the separate CND-06 decision.
//   - Route-backed collections only: data-only collections have no page to
//     preview.
//   - The body is parsed with the SAME parser and render-safety policy the
//     publish projection uses. If the draft body would be rejected at publish
//     time, the preview fails loudly instead of silently falling back to the
//     live version.

function draftPreviewTitle(data: JsonMap, fallback: string): string {
  const candidates = [data.title, data.name, data.label, data.heading]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return fallback
}

export const getDraftPreview = callerQuery.protected({
  id: 'draftPreview:getDraftPreview',
  args: {
    entryId: v.string(),
    locale: v.string(),
  },
  guard: canRead,
  returns: v.object({
    entryId: v.string(),
    collection: v.string(),
    locale: v.string(),
    status: entryStatusValidator,
    title: v.string(),
    /** Prospective path of the DRAFT (where the page would live after publish). */
    path: v.string(),
    /** Currently live path for this locale, when a published version exists. */
    publishedPath: v.union(v.string(), v.null()),
    draftVersion: v.number(),
    updatedAt: v.number(),
    data: v.record(v.string(), jsonValueValidator),
    bodyAst: publicBodyAstValidator,
    toc: v.union(jsonValueValidator, v.null()),
  }),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const collection = await getCollectionForEntry(ctx, entry)

    if (!isRouteBackedCollection(collection)) {
      throwCmsError(
        'DRAFT_PREVIEW_NOT_ROUTE_BACKED',
        'This content has no website page to preview.',
        { collection: collection.slug },
      )
    }

    const draftRows = await readDraftRows(ctx, entry._id)
    const localeRow = draftRows.byLocale[args.locale] ?? null
    if (!localeRow && !collection.locales.includes(args.locale)) {
      throwCmsError('DRAFT_PREVIEW_LOCALE_MISSING', 'This language has no draft to preview.', {
        collection: collection.slug,
        locale: args.locale,
      })
    }

    const shared = (draftRows.shared?.shared ?? {}) as JsonMap
    const values = (localeRow?.values ?? {}) as JsonMap
    const data = materializeFieldData(collection.fields, shared, values)
    const slug = effectiveDraftSlug(entry, draftRows.shared, localeRow)
    const path = await computeDraftPath(ctx, {
      collection,
      entry,
      parentEntryId: effectiveDraftParent(entry, draftRows.shared),
      slug,
      locale: args.locale,
    })

    const publicRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', args.locale))
      .unique()
    const publishedPath = publicRow
      ? await publicPathForEntry(ctx, publicRow, {
          pathPrefix: pathPrefixForLocale(collection, args.locale),
          rootSlug: rootSlugForLocale(collection, args.locale),
        })
      : null

    // Same parse + render-safety gate as the publish projection. A body that
    // cannot render publicly fails the preview instead of showing stale or
    // partial output.
    const parsed = await parseMdcBody(localeRow?.bodyMdc ?? '')
    await assertPublicBodySafe(ctx, parsed.body, collection)

    return {
      entryId: toStringId(entry._id),
      collection: collection.slug,
      locale: args.locale,
      status:
        entry.lifecycle === 'archived'
          ? 'archived'
          : entry.activePublications.length > 0
            ? 'published'
            : 'draft',
      title: draftPreviewTitle(data, slug ?? entry.slug),
      path,
      publishedPath,
      draftVersion: entry.draftVersion,
      updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
      data,
      bodyAst: parsed.body as unknown as Record<string, unknown>,
      toc: encodePublicToc(parsed.toc ?? null),
    }
  },
})
