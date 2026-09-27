// @vitest-environment jsdom
import type { EditorFlushResult } from '@lupinum/ginko-editor'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import {
  readHostBridge,
  setHostBridgeForTesting,
} from '../../packages/cms/studio-app/src/boundary/host-bridge'
import { provideStudioRichtextFlush } from '../../packages/cms/studio-app/src/composables/internal/studioRichtextFlush'
import type {
  StudioEntry,
  StudioField,
} from '../../packages/cms/studio-app/src/composables/internal/types'
import { useEntryDraft } from '../../packages/cms/studio-app/src/composables/internal/useEntryDraft'

const mocks = vi.hoisted(() => ({ save: vi.fn(), guards: [] as Array<() => Promise<boolean>> }))
vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { editor: { saveEntryDraft: 'saveEntryDraft' } } },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mocks.save,
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard: () => Promise<boolean>) => mocks.guards.push(guard),
  onBeforeRouteUpdate: (guard: () => Promise<boolean>) => mocks.guards.push(guard),
}))

function entry(version = 1, title = 'Title', cta = 'Read', locale = 'en'): StudioEntry {
  return {
    _id: 'entry',
    locale,
    slug: 'home',
    baseSlug: 'home',
    status: 'draft',
    draftVersion: version,
    draft: { theme: 'forest' },
    data: { title: 'Rendered fallback must not save' },
    dirtyLocales: [],
    localeData: {
      draftId: `entry-${locale}-draft`,
      draftSlug: 'home',
      draft: { values: { title, cta }, bodyMdc: 'Original body' },
    },
    locales: [
      {
        locale,
        draftExists: true,
        data: {},
        draft: { values: { title, cta }, bodyMdc: 'Original body' },
      },
    ],
  }
}
const fields: StudioField[] = [
  { key: 'title', type: 'text', localized: true },
  { key: 'cta', type: 'text', localized: true },
  { key: 'optional', type: 'text', localized: true },
  { key: 'body', type: 'richtext', localized: true },
  { key: 'hero', type: 'image', localized: true },
  { key: 'theme', type: 'text', localized: false },
]
function fixture(initial = entry(), portable?: { bodyField: string | null }) {
  const current = ref<StudioEntry | null>(initial)
  const locale = ref(initial.locale)
  const entryId = ref(initial._id)
  const allowed = ref(true)
  const initialized = ref(false)
  let subject!: ReturnType<typeof useEntryDraft>
  let richtext!: ReturnType<typeof provideStudioRichtextFlush>
  const authoring = { policy: { version: 2, components: {} }, components: [] }
  setHostBridgeForTesting({
    config: {
      ...readHostBridge().config,
      contract: {
        expectedContentHash: 'current-content',
        expectedPresentationHash: 'current-presentation',
      },
      collections: { landing: { settings: { authoring: JSON.stringify(authoring) } } },
    },
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        richtext = provideStudioRichtextFlush()
        subject = useEntryDraft({
          entry: current,
          entryId,
          collection: ref('landing'),
          contentRoute: '/studio/content',
          collectionConfig: ref({
            _id: 'config',
            slug: 'landing',
            settings: { componentPolicy: authoring.policy, ...(portable ? { portable } : {}) },
            contract: { source: 'code', version: 'current-content' },
          }),
          isTree: ref(false),
          fields: ref(fields),
          sharedFields: ref(fields.filter((field) => !field.localized)),
          localizedFields: ref(fields.filter((field) => field.localized)),
          currentLocale: locale,
          parentPathById: ref(new Map()),
          canEditEntries: allowed,
          initialized,
          richtextFlush: richtext,
          refreshEntry: async () => undefined,
          t: (key) => key,
          studioDebug: {
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            logQueryError: vi.fn(),
            watchQueryError: vi.fn(),
            pushWithLogging: vi.fn(),
          },
        })
        return () => h('div', String(subject.dataFields.title))
      },
    }),
  )
  return { subject, richtext, current, locale, entryId, allowed, wrapper, authoring }
}

beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue({ draftVersion: 3 })
  mocks.guards.length = 0
})
afterEach(() => vi.useRealTimers())

describe('Studio shared session adapter', () => {
  it('keeps a structured page richtext field in values instead of inventing an article body', async () => {
    const initial = entry()
    initial.localeData!.draft.bodyMdc = ''
    initial.localeData!.draft.values.body = 'Structured introduction'
    initial.locales![0]!.draft = initial.localeData!.draft
    const f = fixture(initial, { bodyField: null })
    try {
      expect(f.subject.dataFields.body).toBe('Structured introduction')
      expect(f.subject.assetContext.value.bodyField).toBeNull()
      f.subject.dataFields.body = 'Updated structured introduction'
      await nextTick()
      expect(await f.subject.handleSaveDraft()).toBe(true)
      const saved = mocks.save.mock.calls[0]![0]
      expect(saved.patch.locales.en.bodyMdc).toBe('')
      expect(saved.patch.locales.en.values.body).toBe('Updated structured introduction')
    } finally {
      f.wrapper.unmount()
    }
  })

  it('excludes a room-owned body from scalar writes and their comparison base', async () => {
    const f = fixture()
    try {
      f.richtext.setSharedBody('body:en', 'en')
      f.subject.dataFields.title = 'Metadata only'
      await nextTick()
      expect(await f.subject.handleSaveDraft()).toBe(true)
      const saved = mocks.save.mock.calls[0]![0]
      expect(saved.patch.locales.en.values.title).toBe('Metadata only')
      expect(saved.patch.locales.en).not.toHaveProperty('bodyMdc')
      expect(saved.concurrency.base.locales.en).not.toHaveProperty('bodyMdc')
    } finally {
      f.wrapper.unmount()
    }
  })

  it('keeps publish and preview fenced after an uncertain save even if the person reverts the field', async () => {
    const f = fixture()
    try {
      f.subject.dataFields.title = 'Temporary edit'
      await nextTick()
      mocks.save.mockRejectedValueOnce(new Error('Connection lost'))
      expect(await f.subject.handleSaveDraft()).toBe(false)
      f.subject.dataFields.title = 'Title'
      await nextTick()
      expect(f.subject.isDirty.value).toBe(true)
      expect(await f.subject.handleSaveDraft()).toBe(true)
      expect(mocks.save.mock.calls[1]?.[0]).toEqual(mocks.save.mock.calls[0]?.[0])
      expect(mocks.save.mock.calls[2]?.[0].patch.locales.en.values.title).toBe('Title')
      expect(f.subject.isDirty.value).toBe(false)
    } finally {
      f.wrapper.unmount()
    }
  })

  it('hydrates persisted values and authoring metadata without saving displayed defaults', async () => {
    const f = fixture()
    try {
      await nextTick()
      expect(f.subject.dataFields.title).toBe('Title')
      expect(f.subject.assetContext.value.authoringSource).toEqual(f.authoring)
      expect(f.subject.dataFields.optional).toBe('')
      expect(f.subject.isDirty.value).toBe(false)
      expect(await f.subject.handleSaveDraft()).toBe(true)
      expect(mocks.save).not.toHaveBeenCalled()
    } finally {
      f.wrapper.unmount()
    }
  })

  it('keeps local typing with a remote independent field and sends only stored baselines', async () => {
    const f = fixture()
    try {
      f.subject.dataFields.title = 'Mine'
      f.current.value = entry(2, 'Title', 'Explore')
      await nextTick()
      expect(f.subject.dataFields.title).toBe('Mine')
      expect(f.subject.dataFields.cta).toBe('Explore')
      expect(await f.subject.handleSaveDraft()).toBe(true)
      const request = mocks.save.mock.calls[0]?.[0]
      expect(request.patch.locales.en.values).toEqual({ title: 'Mine', cta: 'Explore' })
      expect(request.concurrency.base.locales.en.values).toEqual({ title: 'Title', cta: 'Explore' })
    } finally {
      f.wrapper.unmount()
    }
  })

  it('hydrates a deferred remote value after autosave acknowledgement without another query', async () => {
    vi.useFakeTimers()
    let acknowledge!: (result: { draftVersion: number }) => void
    mocks.save.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve
        }),
    )
    const f = fixture()
    try {
      f.subject.dataFields.title = 'Mine'
      await vi.advanceTimersByTimeAsync(901)
      expect(mocks.save).toHaveBeenCalledOnce()
      f.current.value = entry(3, 'Mine', 'Remote CTA')
      await nextTick()
      expect(f.subject.dataFields.cta).toBe('Read')
      acknowledge({ draftVersion: 2 })
      await flushPromises()
      expect(f.subject.dataFields.cta).toBe('Remote CTA')
      expect(f.subject.isDirty.value).toBe(false)
    } finally {
      f.wrapper.unmount()
    }
  })

  it('flushes editor conversion before a route change and blocks unfinished uploads', async () => {
    const f = fixture()
    try {
      let ready = false
      f.richtext.register('body', {
        flush: async (): Promise<EditorFlushResult> => {
          if (!ready)
            return {
              ok: false,
              emitted: false,
              error: { code: 'conversion-failed', message: 'Finish the image upload.' },
            }
          f.subject.dataFields.body = 'Final converted body'
          f.richtext.setPending('body', false)
          return { ok: true, emitted: true }
        },
        hasPendingChanges: () => true,
        removeSelectedMedia: () => false,
      })
      f.richtext.setPending('body', true)
      expect(await mocks.guards[0]!()).toBe(false)
      expect(f.subject.error.value).toBe('Finish the image upload.')
      expect(mocks.save).not.toHaveBeenCalled()
      ready = true
      expect(await mocks.guards[0]!()).toBe(true)
      expect(mocks.save.mock.calls[0]?.[0].patch.locales.en.bodyMdc).toBe('Final converted body')
    } finally {
      f.wrapper.unmount()
    }
  })

  it('does not clear local work when a publication status query arrives', async () => {
    const f = fixture()
    try {
      f.subject.dataFields.title = 'Working after review'
      f.current.value = { ...entry(), status: 'published' }
      await nextTick()
      expect(f.subject.dataFields.title).toBe('Working after review')
      expect(f.subject.isDirty.value).toBe(true)
    } finally {
      f.wrapper.unmount()
    }
  })

  it('never saves the fallback body of a missing locale', async () => {
    const missing = entry(1, 'Fallback', 'Fallback CTA', 'de')
    missing.locales![0]!.draftExists = false
    const f = fixture(missing)
    try {
      expect(f.subject.dataFields.title).toBe('')
      f.subject.dataFields.title = 'Attempted edit'
      expect(await f.subject.handleSaveDraft()).toBe(true)
      expect(mocks.save).not.toHaveBeenCalled()
    } finally {
      f.wrapper.unmount()
    }
  })

  it('ignores stale identity results and starts the next locale from its own persisted values', async () => {
    const f = fixture()
    try {
      f.locale.value = 'de'
      f.current.value = entry(2, 'Old result', 'Read')
      await nextTick()
      f.subject.dataFields.title = 'Should not write to English'
      expect(await f.subject.handleSaveDraft()).toBe(true)
      expect(mocks.save).not.toHaveBeenCalled()
      f.current.value = entry(3, 'Deutsch', 'Lesen', 'de')
      await nextTick()
      expect(f.subject.dataFields.title).toBe('Deutsch')
      f.subject.dataFields.title = 'Neue Überschrift'
      await f.subject.handleSaveDraft()
      expect(Object.keys(mocks.save.mock.calls[0]?.[0].patch.locales)).toEqual(['de'])
    } finally {
      f.wrapper.unmount()
    }
  })
})
