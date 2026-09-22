import { CMS_JSON_MAX_DEPTH } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { FunctionArgs } from 'convex/server'

import type { GinkoCmsStudioHostApi } from '../types.js'
import type { DraftSaveRequest } from './session.js'

type TransportRequest = FunctionArgs<GinkoCmsStudioHostApi['ginkoCms']['editor']['saveEntryDraft']>

/**
 * Convex code generation expands the JSON validator into a finite-depth union.
 * The editing model uses recursive JSON. Prove the same depth limit before
 * narrowing at the transport boundary; never cast away that difference.
 */
export function validateDraftSaveRequest(
  request: DraftSaveRequest,
): asserts request is DraftSaveRequest & TransportRequest {
  const locales = Object.keys(request.patch.locales ?? {})
  if (
    Object.keys(request.concurrency.localeDraftIds).length !== locales.length ||
    locales.some((locale) => !request.concurrency.localeDraftIds[locale])
  ) {
    const message =
      'The language changed while you were editing. Reload its current working version before saving.'
    throw Object.assign(new Error(message), { data: { code: 'ENTRY_DRAFT_BASE_INVALID', message } })
  }
  const fail = () => {
    const message = `A content field exceeds the supported ${CMS_JSON_MAX_DEPTH} levels of nesting.`
    throw Object.assign(new Error(message), { data: { code: 'ENTRY_FIELD_INVALID', message } })
  }
  const validateValue = (value: JsonValue, depth: number): void => {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number' && !Number.isFinite(value)) fail()
      return
    }
    if (depth <= 0) fail()
    for (const child of Object.values(value)) validateValue(child, depth - 1)
  }
  for (const patch of [request.patch, request.concurrency.base]) {
    for (const value of Object.values(patch.shared?.shared ?? {}))
      validateValue(value, CMS_JSON_MAX_DEPTH)
    for (const locale of Object.values(patch.locales ?? {}))
      for (const value of Object.values(locale.values ?? {}))
        validateValue(value, CMS_JSON_MAX_DEPTH)
  }
}
