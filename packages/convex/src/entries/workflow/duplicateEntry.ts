import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import { assertCollectionSupportsLocale, isLocalizedSlugMode } from '../../lib/collections.js'
import { assertMdcBodyWithinLimit } from '../../lib/contentLimits.js'
import { resolveTitleFieldKey as resolveCollectionTitleFieldKey } from '../../lib/fields.js'
import { assertCmsContractWritable } from '../../lib/installedContract.js'
import { generateStableId } from '../../lib/paths.js'
import type { CmsCollection, MutationCtx } from '../../lib/types.js'
import {
  assertFieldDataValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../../lib/validation.js'
import type { EntryDoc } from '../context.js'
import { assertNoDraftSiblingPathConflict } from '../draftPathConflicts.js'
import { resolveEntryPlacement } from '../placement.js'
import { refreshDraftAssetRefsForSave } from './draftCommands.js'
import { readDraftRows } from './drafts.js'

export type DuplicateEntryVariant = {
  locale: string
  title: string
  slug: string
}

export type DuplicateEntryResult = {
  entryId: string
  stableId: string
  slug: string
  locales: string[]
  parentEntryId: string | null
  orderRank: string
  draftVersion: number
}

function normalizedVariants(
  collection: CmsCollection,
  variants: DuplicateEntryVariant[],
): DuplicateEntryVariant[] {
  if (variants.length === 0) {
    throwCmsError(
      'ENTRY_DUPLICATE_LOCALES_REQUIRED',
      'Select at least one existing locale draft to duplicate.',
    )
  }
  if (variants.length > collection.locales.length) {
    throwCmsError(
      'ENTRY_DUPLICATE_LOCALE_LIMIT',
      'The duplicate contains more locale drafts than the collection supports.',
      { supportedLocales: collection.locales },
    )
  }

  const seen = new Set<string>()
  return variants.map((variant) => {
    const locale = variant.locale.trim()
    assertValidLocaleCode(locale, 'ENTRY_LOCALE_INVALID')
    assertCollectionSupportsLocale(collection, locale)
    if (seen.has(locale)) {
      throwCmsError(
        'ENTRY_DUPLICATE_LOCALE_REPEATED',
        `Locale "${locale}" may only be selected once.`,
        { locale },
      )
    }
    seen.add(locale)

    const title = variant.title.trim()
    if (!title) {
      throwCmsError(
        'ENTRY_DUPLICATE_TITLE_REQUIRED',
        `Provide a new title for locale "${locale}".`,
        { locale },
      )
    }
    const slug = variant.slug.trim()
    assertValidSlug(slug)
    return { locale, title, slug }
  })
}

function oneSharedValue(variants: DuplicateEntryVariant[], key: 'title' | 'slug'): string {
  const values = new Set(variants.map((variant) => variant[key]))
  if (values.size !== 1) {
    throwCmsError(
      key === 'title'
        ? 'ENTRY_DUPLICATE_SHARED_TITLE_MISMATCH'
        : 'ENTRY_DUPLICATE_SHARED_SLUG_MISMATCH',
      `All selected locales must use the same ${key} because this collection shares it across locales.`,
    )
  }
  return variants[0]![key]
}

function titleFieldForCollection(collection: CmsCollection) {
  const titleKey = resolveCollectionTitleFieldKey(collection.fields, collection.settings)
  const field = titleKey ? collection.fields.find((candidate) => candidate.key === titleKey) : null
  if (!titleKey || !field) {
    throwCmsError(
      'ENTRY_DUPLICATE_TITLE_FIELD_MISSING',
      'This collection has no title field that can be replaced on a duplicate.',
    )
  }
  return { titleKey, localized: field.localized === true }
}

export async function duplicateCanonicalEntry(
  ctx: MutationCtx,
  args: {
    source: EntryDoc
    collection: CmsCollection
    appIdentityId: string
    now: number
    variants: DuplicateEntryVariant[]
  },
): Promise<DuplicateEntryResult> {
  await assertCmsContractWritable(ctx)
  if (args.collection.routing.singleton) {
    throwCmsError(
      'ENTRY_DUPLICATE_SINGLETON',
      'Singleton collections cannot contain a duplicate entry.',
      { collection: args.collection.slug },
    )
  }

  const variants = normalizedVariants(args.collection, args.variants)
  const sourceDrafts = await readDraftRows(ctx, args.source._id)
  for (const variant of variants) {
    if (!sourceDrafts.byLocale[variant.locale]) {
      throwCmsError(
        'ENTRY_DUPLICATE_SOURCE_LOCALE_MISSING',
        `The source has no draft for locale "${variant.locale}".`,
        { sourceEntryId: String(args.source._id), locale: variant.locale },
      )
    }
  }

  const { titleKey, localized: localizedTitle } = titleFieldForCollection(args.collection)
  const localizedSlug = isLocalizedSlugMode(args.collection)
  for (const variant of variants) {
    const sourceLocale = sourceDrafts.byLocale[variant.locale]!
    const sourceTitle = localizedTitle
      ? sourceLocale.values[titleKey]
      : (args.source.shared as JsonMap)[titleKey]
    if (typeof sourceTitle === 'string' && sourceTitle.trim() === variant.title) {
      throwCmsError(
        'ENTRY_DUPLICATE_TITLE_UNCHANGED',
        `Provide a title different from the source for locale "${variant.locale}".`,
        { locale: variant.locale },
      )
    }
    const sourceSlug = sourceLocale.slug ?? args.source.slug
    if (sourceSlug === variant.slug) {
      throwCmsError(
        'ENTRY_DUPLICATE_SLUG_UNCHANGED',
        `Provide a slug different from the source for locale "${variant.locale}".`,
        { locale: variant.locale },
      )
    }
  }
  const sharedTitle = localizedTitle ? null : oneSharedValue(variants, 'title')
  const sharedSlug = localizedSlug ? null : oneSharedValue(variants, 'slug')
  const entrySlug = sharedSlug ?? variants[0]!.slug
  const shared: JsonMap = {
    ...(args.source.shared as JsonMap),
    ...(sharedTitle === null ? {} : { [titleKey]: sharedTitle }),
  }

  const placement = await resolveEntryPlacement(ctx, {
    collection: args.collection,
    collectionSlug: args.source.collection,
    parentEntryId: args.source.parentEntryId ? String(args.source.parentEntryId) : undefined,
    afterEntryId: String(args.source._id),
  })
  const stableId = await generateStableId(ctx, args.source.collection)
  const entryId = await ctx.db.insert('entries', {
    collection: args.source.collection,
    stableId,
    lifecycle: 'active',
    slug: entrySlug,
    parentEntryId: placement.parentEntryId,
    orderRank: placement.orderRank,
    nodeKind: args.source.nodeKind,
    shared,
    draftVersion: 1,
    sharedVersion: 1,
    activePublications: [],
    latestEditorialRevisionId: null,
    createdBy: args.appIdentityId,
    updatedBy: args.appIdentityId,
    createdAt: args.now,
    updatedAt: args.now,
  })

  for (const variant of variants) {
    const sourceLocale = sourceDrafts.byLocale[variant.locale]!
    const values: JsonMap = {
      ...(sourceLocale.values as JsonMap),
      ...(localizedTitle ? { [titleKey]: variant.title } : {}),
    }
    assertMdcBodyWithinLimit(sourceLocale.bodyMdc, {
      locale: variant.locale,
      field: 'bodyMdc',
    })
    assertFieldDataValid(
      args.collection.fields,
      materializeFieldData(args.collection.fields, shared, values),
      { publish: false },
    )
    await ctx.db.insert('entryLocaleDrafts', {
      entryId,
      locale: variant.locale,
      slug: localizedSlug ? variant.slug : null,
      values,
      bodyMdc: sourceLocale.bodyMdc,
      version: 1,
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
  }

  const destination = await ctx.db.get(entryId)
  if (!destination) throw new Error('Duplicated entry was not persisted.')
  await assertNoDraftSiblingPathConflict(ctx, {
    entry: destination,
    collection: args.collection,
    locales: variants.map((variant) => variant.locale),
    parentEntryId: placement.parentEntryId,
    slugByLocale: Object.fromEntries(variants.map((variant) => [variant.locale, variant.slug])),
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId,
    collection: args.source.collection,
    sharedUpdated: true,
    affectedLocales: variants.map((variant) => variant.locale),
  })
  await logActivity(ctx, {
    kind: 'entry.duplicated',
    summary: `Duplicated ${args.source.collection} entry "${entrySlug}"`,
    appIdentityId: args.appIdentityId,
    entryId,
    collection: args.source.collection,
    locale: variants[0]!.locale,
    detail: {
      sourceEntryId: String(args.source._id),
      locales: variants.map((variant) => variant.locale),
    },
    createdAt: args.now,
  })

  return {
    entryId: String(entryId),
    stableId,
    slug: entrySlug,
    locales: variants.map((variant) => variant.locale),
    parentEntryId: placement.parentEntryId ? String(placement.parentEntryId) : null,
    orderRank: placement.orderRank,
    draftVersion: 1,
  }
}
