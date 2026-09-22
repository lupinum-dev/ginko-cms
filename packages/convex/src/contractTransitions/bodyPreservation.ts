/** Preserve article content before a reviewed contract removes its body field. */
import { parseMdcBody, type ResolvedContentCollection } from '@lupinum/ginko-content/cms-contract'

import type { Doc } from '../_generated/dataModel.js'
import { extractAssetRefsFromText } from '../entries/workflow/assetRefs.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import type { TransitionOutput } from './model.js'

export async function validateTransitionBodyPreservation(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  output: TransitionOutput,
  collection: ResolvedContentCollection,
): Promise<void> {
  if (collection.portable.bodyField === null) {
    const original = await readDraftRows(ctx, entry._id)
    for (const [locale, draft] of Object.entries(original.byLocale)) {
      if (draft.bodyMdc === '') continue
      if (extractAssetRefsFromText(draft.bodyMdc, { fieldPath: 'bodyMdc', locale }).length > 0) {
        throw new Error(
          'CONTRACT_TRANSITION_BODY_ASSETS_REQUIRE_MIGRATION: retain the article body until embedded media have an explicit portable field migration.',
        )
      }
      const value = output.locales[locale]
      const preserved =
        value &&
        collection.fields.some(
          (field) =>
            field.type === 'richtext' &&
            (field.localized ? value.values[field.key] : output.shared[field.key]) ===
              draft.bodyMdc,
        )
      if (!preserved)
        throw new Error(
          `CONTRACT_TRANSITION_BODY_LOSS: preserve the existing ${locale} body in an explicit rich-text field before removing the article body.`,
        )
    }
  }
  for (const [locale, value] of Object.entries(output.locales)) {
    if (collection.portable.bodyField === null && value.bodyMdc !== '') {
      throw new Error(
        'CONTRACT_TRANSITION_BODY_NOT_SUPPORTED: structured content cannot retain an article body.',
      )
    }
    assertMdcBodyWithinLimit(value.bodyMdc, { locale, field: 'bodyMdc' })
    if (collection.portable.bodyField !== null) await parseMdcBody(value.bodyMdc)
  }
}
