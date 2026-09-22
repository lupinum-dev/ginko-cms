import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import {
  canRebaseEntryBody,
  readEntryDraftBase,
} from '../../packages/cms/studio-app/src/composables/internal/entryDraftBase'
import type { StudioEntry } from '../../packages/cms/studio-app/src/composables/internal/types'

function entry(): StudioEntry {
  return {
    _id: 'entry',
    locale: 'en',
    slug: 'hello',
    status: 'draft',
    draftVersion: 1,
    dirtyLocales: [],
    data: { title: 'Hello' },
    draft: { featured: true },
    localeData: {
      draft: {
        values: { title: 'Hello' },
        bodyMdc: 'Body.',
      },
    },
  }
}

describe('body checkpoint rebasing', () => {
  it('advances a metadata form only when the server changed its body and the local body is untouched', () => {
    const before = entry(),
      base = readEntryDraftBase(before)
    const next = {
      ...before,
      draftVersion: 2,
      localeData: { draft: { ...before.localeData!.draft, bodyMdc: 'Shared body.' } },
    }
    expect(canRebaseEntryBody(base, next, 'Body.')).toBe(true)
    expect(canRebaseEntryBody(base, next, 'Unsaved local body.')).toBe(false)
    expect(canRebaseEntryBody(base, { ...next, slug: 'different' }, 'Body.')).toBe(false)
    expect(canRebaseEntryBody(base, { ...next, draft: { featured: false } }, 'Body.')).toBe(false)
    expect(
      canRebaseEntryBody(
        base,
        {
          ...next,
          localeData: { draft: { ...next.localeData.draft, values: { title: 'Remote title' } } },
        },
        'Body.',
      ),
    ).toBe(false)
  })

  it('detaches the baseline from Vue proxies so later query changes cannot erase the conflict fence', () => {
    const observed = reactive(entry())
    const base = readEntryDraftBase(observed)
    observed.localeData!.draft.values.title = 'Changed in place'
    expect(canRebaseEntryBody(base, observed, 'Body.')).toBe(false)
  })
})
