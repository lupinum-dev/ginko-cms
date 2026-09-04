import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'

import type { Doc } from '../_generated/dataModel.js'
import { previewPublishImpactForEntry } from '../diagnostics.js'
import { relationDiagnosticsForData } from '../diagnostics/shared.js'
import type { CmsErrorData } from '../errors.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { buildPublicAssetFacts } from '../publicAssets.js'
import { assertNoDraftSiblingPathConflict } from './draftPathConflicts.js'
import {
  extractAssetRefsFromText,
  extractPublicFieldAssetRefs,
  uniqueAssetRefs,
} from './workflow/assetRefs.js'
import { buildDraftSnapshots } from './workflow/draftCommands.js'
import { assertValidDraftParentChain } from './workflow/draftPlacement.js'
import { readDraftRows } from './workflow/drafts.js'

export type RestoreEligibilityIssue = {
  code: string
  message: string
  details: unknown
}

function issueFromError(error: unknown, fallbackCode: string): RestoreEligibilityIssue {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as Partial<CmsErrorData> | undefined
    if (typeof data?.code === 'string' && typeof data.message === 'string') {
      return { code: data.code, message: data.message, details: data.details ?? null }
    }
  }
  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message, details: null }
  }
  return {
    code: fallbackCode,
    message: 'Restore eligibility could not be verified.',
    details: null,
  }
}

function uniqueIssues(issues: RestoreEligibilityIssue[]): RestoreEligibilityIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.message}\u0000${JSON.stringify(issue.details)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Rebuild every restore blocker from canonical draft/contract state. Restore
 * does not publish, so required editorial fields and a private parent are not
 * blockers; invalid placement, route ownership, relations, and asset bytes are.
 */
export async function inspectRestoreEligibility(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
) {
  await assertCmsContractWritable(ctx)
  const draftRows = await readDraftRows(ctx, entry._id)
  const locales = Object.keys(draftRows.byLocale).sort()
  const blockers: RestoreEligibilityIssue[] = []
  let relationCount = 0
  let assetCount = 0

  if (locales.length === 0) {
    blockers.push({
      code: 'ENTRY_LOCALE_DRAFT_MISSING',
      message: 'The archived entry has no localized draft to restore.',
      details: null,
    })
  }
  for (const locale of locales) {
    if (!collection.locales.includes(locale)) {
      blockers.push({
        code: 'ENTRY_LOCALE_NOT_CONFIGURED',
        message: `Locale "${locale}" is not present in the installed contract.`,
        details: { locale },
      })
    }
  }

  try {
    await assertValidDraftParentChain(ctx, { collection, entry })
  } catch (error) {
    blockers.push(issueFromError(error, 'ENTRY_PARENT_INVALID'))
  }
  try {
    await assertNoDraftSiblingPathConflict(ctx, { entry, collection, locales })
  } catch (error) {
    blockers.push(issueFromError(error, 'ENTRY_PATH_CONFLICT'))
  }
  try {
    await buildDraftSnapshots(ctx, entry, collection, locales, false)
  } catch (error) {
    blockers.push(issueFromError(error, 'ENTRY_DRAFT_INVALID'))
  }

  if (locales.length > 0) {
    try {
      const impact = await previewPublishImpactForEntry(ctx, {
        collection: collection.slug,
        entryId: String(entry._id),
        locales,
      })
      const editoriallySafeCodes = new Set([
        'missing_locale_route',
        'missing_parent_route',
        'missing_required_localized_field',
      ])
      for (const diagnostic of impact.blockingDiagnostics) {
        if (editoriallySafeCodes.has(diagnostic.code)) continue
        blockers.push({
          code: diagnostic.code,
          message: diagnostic.message,
          details: diagnostic.details ?? null,
        })
      }
    } catch (error) {
      blockers.push(issueFromError(error, 'ENTRY_ROUTE_CHECK_FAILED'))
    }
  }

  for (const locale of locales) {
    const row = draftRows.byLocale[locale]!
    const data = materializeFieldData(collection.fields, entry.shared, row.values)
    const relationDiagnostics = await relationDiagnosticsForData({
      ctx,
      collection,
      entryId: String(entry._id),
      locale,
      path: null,
      href: null,
      data,
    })
    for (const diagnostic of relationDiagnostics) {
      relationCount += 1
      blockers.push({
        code: 'ENTRY_RELATION_TARGET_MISSING',
        message: diagnostic.message,
        details: diagnostic.details ?? null,
      })
    }

    const assetRefs = uniqueAssetRefs([
      ...extractPublicFieldAssetRefs(data, collection.fields, {
        fieldPathPrefix: 'data',
        locale,
      }),
      ...extractAssetRefsFromText(row.bodyMdc, { fieldPath: 'bodyMdc', locale }),
    ])
    assetCount += assetRefs.length
    try {
      await buildPublicAssetFacts(ctx, assetRefs)
    } catch (error) {
      blockers.push(issueFromError(error, 'PUBLIC_ASSET_MISSING'))
    }
  }

  return {
    locales,
    relationCount,
    assetCount,
    blockers: uniqueIssues(blockers),
  }
}
