import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import {
  EntryDraftSession,
  type DraftSaveRequest,
  type DraftSnapshot,
} from '../../packages/cms/src/public/editing/session'

function snapshot(version: number, title = 'Hello', cta = 'Read', de = 'Hallo'): DraftSnapshot {
  return {
    version,
    localeDraftIds: { en: 'en-draft', de: 'de-draft' },
    patch: { locales: { en: { values: { title, cta } }, de: { values: { title: de } } } },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup(save = vi.fn(async (_request: DraftSaveRequest) => ({ draftVersion: 2 }))) {
  let id = 0
  const session = reactive(
    new EntryDraftSession({
      entryId: 'entry',
      canEdit: () => true,
      save,
      requestId: () => `request-${++id}`,
    }),
  )
  session.receive(snapshot(1))
  return { session, save }
}
afterEach(() => vi.useRealTimers())

describe('shared Studio and website draft session', () => {
  it('fences removed and recreated languages even when their values are identical', async () => {
    const { session, save } = setup()
    session.edit(snapshot(1, 'My headline').patch)
    session.receive({ ...snapshot(2), localeDraftIds: { en: 'replacement', de: 'de-draft' } })
    expect(session.conflicts).toMatchObject([
      { path: ['locales', 'en', 'values', 'title'], mine: 'My headline', shared: 'Hello' },
    ])
    expect(await session.flush()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    session.resolve(['locales', 'en', 'values', 'title'], 'mine')
    expect(await session.flush()).toBe(true)
    expect(save.mock.calls[0]?.[0].concurrency.localeDraftIds).toEqual({
      en: 'replacement',
      de: 'de-draft',
    })
    session.dispose()
  })

  it('requires an explicit choice after replacement even when a later query matches the local value', async () => {
    const { session, save } = setup()
    session.edit(snapshot(1, 'My headline').patch)
    const replacement = {
      ...snapshot(2, 'My headline'),
      localeDraftIds: { en: 'replacement', de: 'de-draft' },
    }
    session.receive(replacement)
    session.receive(replacement)
    expect(session.hasPendingWork).toBe(true)
    expect(session.conflicts).toHaveLength(1)
    expect(await session.flush()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    session.resolve(['locales', 'en', 'values', 'title'], 'shared')
    expect(await session.flush()).toBe(true)
    session.dispose()
  })

  it('retains the original locale identities for an ambiguous retry', async () => {
    const save = vi.fn(async (_request: DraftSaveRequest) => ({ draftVersion: 3 }))
    save.mockRejectedValueOnce(new Error('Connection lost'))
    const { session } = setup(save)
    session.edit(snapshot(1, 'My headline').patch)
    expect(await session.flush()).toBe(false)
    session.receive({ ...snapshot(2), localeDraftIds: { en: 'replacement', de: 'de-draft' } })
    save.mockRejectedValueOnce(
      Object.assign(new Error('Language replaced'), {
        data: { code: 'ENTRY_DRAFT_LOCALE_REPLACED' },
      }),
    )
    expect(await session.flush()).toBe(false)
    expect(save.mock.calls[1]?.[0]).toEqual(save.mock.calls[0]?.[0])
    expect(session.hasUnconfirmedSave).toBe(false)
    expect(session.conflicts).toHaveLength(1)
    expect(session.patch.locales?.en?.values?.title).toBe('My headline')
    session.dispose()
  })

  it('merges remote fields and languages while preserving local intent', () => {
    const { session } = setup()
    session.edit(snapshot(1, 'My headline').patch)
    session.receive(snapshot(2, 'Hello', 'Explore', 'Guten Tag'))
    expect(session.patch).toEqual(snapshot(2, 'My headline', 'Explore', 'Guten Tag').patch)
    expect(session.conflicts).toEqual([])
    expect(session.dirty).toBe(true)
    session.dispose()
  })

  it('preserves both overlapping values until explicitly resolved, including repeated queries', () => {
    const { session } = setup()
    session.edit(snapshot(1, 'Mine').patch)
    session.receive(snapshot(2, 'Theirs'))
    session.receive(snapshot(2, 'Theirs'))
    expect(session.conflicts).toEqual([
      {
        path: ['locales', 'en', 'values', 'title'],
        before: 'Hello',
        mine: 'Mine',
        shared: 'Theirs',
      },
    ])
    session.resolve(['locales', 'en', 'values', 'title'], 'mine')
    expect(session.conflicts).toEqual([])
    expect(session.patch.locales?.en?.values?.title).toBe('Mine')
    session.dispose()
  })

  it('keeps typing during save and serially persists the newer text', async () => {
    const first = deferred<{ draftVersion: number }>()
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ draftVersion: 3 })
    const { session } = setup(save)
    session.edit(snapshot(1, 'First').patch)
    const flush = session.flush()
    session.edit(snapshot(1, 'Second').patch)
    session.receive(snapshot(2, 'First'))
    first.resolve({ draftVersion: 2 })
    expect(await flush).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[0].patch.locales.en.values.title).toBe('Second')
    expect(save.mock.calls[1]?.[0].concurrency.base.locales.en.values.title).toBe('First')
    expect(session.dirty).toBe(false)
    session.dispose()
  })

  it('merges a query arriving before mutation acknowledgement without a false conflict', async () => {
    const pending = deferred<{ draftVersion: number }>()
    const { session } = setup(vi.fn(() => pending.promise))
    session.edit(snapshot(1, 'Saved title').patch)
    const flush = session.flush()
    session.receive(snapshot(3, 'Saved title', 'Remote CTA'))
    pending.resolve({ draftVersion: 2 })
    expect(await flush).toBe(true)
    expect(session.patch.locales?.en?.values).toEqual({ title: 'Saved title', cta: 'Remote CTA' })
    expect(session.version).toBe(3)
    expect(session.conflicts).toEqual([])
    session.dispose()
  })

  it('retries the identical ambiguous request before saving later typing', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ draftVersion: 2 })
      .mockResolvedValueOnce({ draftVersion: 4 })
    const { session } = setup(save)
    session.edit(snapshot(1, 'First').patch)
    expect(await session.flush()).toBe(false)
    session.edit(snapshot(1, 'Second').patch)
    session.receive(snapshot(3, 'First', 'Remote CTA'))
    expect(await session.flush()).toBe(true)
    expect(save.mock.calls[1]?.[0]).toEqual(save.mock.calls[0]?.[0])
    expect(save.mock.calls[2]?.[0].concurrency.requestId).not.toBe(
      save.mock.calls[0]?.[0].concurrency.requestId,
    )
    expect(session.patch.locales?.en?.values).toEqual({ title: 'Second', cta: 'Remote CTA' })
    session.dispose()
  })

  it('does not overwrite a later overlapping save after an ambiguous acknowledgement', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ draftVersion: 2 })
    const { session } = setup(save)
    session.edit(snapshot(1, 'First').patch)
    await session.flush()
    session.edit(snapshot(1, 'My next edit').patch)
    session.receive(snapshot(3, 'Other person'))
    expect(await session.flush()).toBe(false)
    expect(session.conflicts[0]?.mine).toBe('My next edit')
    expect(session.conflicts[0]?.shared).toBe('Other person')
    expect(save).toHaveBeenCalledTimes(2)
    session.dispose()
  })

  it('awaits conversion before capture and blocks an unfinished upload', async () => {
    let ready = false
    const conversion = deferred<boolean>()
    const save = vi.fn(async () => ({ draftVersion: 2 }))
    const session = new EntryDraftSession({
      entryId: 'entry',
      canEdit: () => true,
      save,
      flushEditors: () => (ready ? Promise.resolve(false) : conversion.promise),
    })
    session.receive(snapshot(1))
    const flush = session.flush()
    session.edit(snapshot(1, 'Converted').patch)
    expect(save).not.toHaveBeenCalled()
    conversion.resolve(true)
    expect(await flush).toBe(true)
    ready = true
    session.edit(snapshot(2, 'Pending upload').patch)
    expect(await session.flush()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    expect(session.hasPendingWork).toBe(true)
    session.dispose()
  })

  it('never autosaves after disposal or with revoked permission', async () => {
    vi.useFakeTimers()
    let allowed = true
    const save = vi.fn()
    const session = new EntryDraftSession({ entryId: 'entry', canEdit: () => allowed, save })
    session.receive(snapshot(1))
    session.edit(snapshot(1, 'Mine').patch)
    allowed = false
    await vi.runAllTimersAsync()
    expect(save).not.toHaveBeenCalled()
    expect(await session.flush()).toBe(false)
    session.dispose()
    expect(await session.flush()).toBe(false)
  })
})

describe('draft boundary recovery', () => {
  it('defers a remote body until conversion exposes the local value, then preserves both', async () => {
    let pending = false
    const save = vi.fn(async () => ({ draftVersion: 3 }))
    const session = reactive(
      new EntryDraftSession({
        entryId: 'entry',
        canEdit: () => true,
        save,
        hasPendingEditors: () => pending,
        flushEditors: async () => {
          session.edit({ locales: { en: { bodyMdc: 'My converted body' } } })
          pending = false
          return true
        },
      }),
    )
    session.receive({
      localeDraftIds: { en: 'en-draft' },
      version: 1,
      patch: { locales: { en: { bodyMdc: 'Original' } } },
    })
    pending = true
    session.receive({
      localeDraftIds: { en: 'en-draft' },
      version: 2,
      patch: { locales: { en: { bodyMdc: 'Their body' } } },
    })
    expect(session.patch.locales?.en?.bodyMdc).toBe('Original')
    expect(await session.flush()).toBe(false)
    expect(session.conflicts[0]).toMatchObject({ mine: 'My converted body', shared: 'Their body' })
    expect(save).not.toHaveBeenCalled()
    session.dispose()
  })

  it('creates a fresh request for corrected fields after a definitive JSON-string error', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({
        data: JSON.stringify({ code: 'ENTRY_FIELD_INVALID', message: 'Invalid title' }),
      })
      .mockResolvedValueOnce({ draftVersion: 2 })
    const { session } = setup(save)
    session.edit(snapshot(1, 'Invalid').patch)
    expect(await session.flush()).toBe(false)
    expect(session.hasUnconfirmedSave).toBe(false)
    session.edit(snapshot(1, 'Corrected').patch)
    expect(session.error).toBeNull()
    expect(await session.flush()).toBe(true)
    expect(save.mock.calls[1]?.[0].patch.locales.en.values.title).toBe('Corrected')
    expect(save.mock.calls[1]?.[0].concurrency.requestId).not.toBe(
      save.mock.calls[0]?.[0].concurrency.requestId,
    )
    session.dispose()
  })

  it('clears a rejected conflict request so the person can choose their local value', async () => {
    const pending = deferred<{ draftVersion: number }>()
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ draftVersion: 3 })
    const { session } = setup(save)
    session.edit(snapshot(1, 'Mine').patch)
    const flush = session.flush()
    session.receive(snapshot(2, 'Theirs'))
    pending.reject({
      data: JSON.stringify({ code: 'ENTRY_DRAFT_FIELD_CONFLICT', message: 'Changed elsewhere' }),
    })
    expect(await flush).toBe(false)
    session.resolve(['locales', 'en', 'values', 'title'], 'mine')
    expect(await session.flush()).toBe(true)
    expect(save.mock.calls[1]?.[0].concurrency.base.locales.en.values.title).toBe('Theirs')
    session.dispose()
  })

  it('catches host conversion exceptions and retains the visual work', async () => {
    const save = vi.fn()
    const session = new EntryDraftSession({
      entryId: 'entry',
      canEdit: () => true,
      save,
      hasPendingEditors: () => true,
      flushEditors: async () => {
        throw new Error('Conversion failed')
      },
    })
    await expect(session.flush()).resolves.toBe(false)
    expect(session.state).toBe('error')
    expect(session.hasPendingWork).toBe(true)
    expect(save).not.toHaveBeenCalled()
    session.dispose()
  })
})

describe('single persistence owner', () => {
  it('coalesces simultaneous save and reconnect requests until all later typing is saved', async () => {
    const first = deferred<{ draftVersion: number }>()
    const second = deferred<{ draftVersion: number }>()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { session } = setup(save)
    session.edit(snapshot(1, 'First').patch)
    const autosave = session.flush()
    session.edit(snapshot(1, 'Second').patch)
    let done = false
    const manual = session.flush().then((value) => {
      done = true
      return value
    })
    first.resolve({ draftVersion: 2 })
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(2)
    expect(done).toBe(false)
    second.resolve({ draftVersion: 3 })
    expect(await autosave).toBe(true)
    expect(await manual).toBe(true)
    expect(session.hasPendingWork).toBe(false)
    session.dispose()
  })
})

describe('canonical field data', () => {
  it('preserves field names that shadow object properties without mutating prototypes', () => {
    const { session } = setup()
    const values = JSON.parse('{"__proto__":{"label":"safe"},"constructor":"field"}')
    session.receive({
      localeDraftIds: { en: 'en-draft' },
      version: 2,
      patch: { locales: { en: { values } } },
    })
    const actual = session.patch.locales?.en?.values
    expect(JSON.stringify(actual)).toBe(JSON.stringify(values))
    expect(Object.getPrototypeOf(actual)).toBe(Object.prototype)
    session.dispose()
  })
})
