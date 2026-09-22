// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import type {
  StudioEntry,
  StudioField,
  StudioCollectionConfig,
} from '../../packages/cms/studio-app/src/composables/internal/types'
import { useEntryDraft } from '../../packages/cms/studio-app/src/composables/internal/useEntryDraft'

const mutation = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mutation,
}))
vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { editor: { saveEntryDraft: 'save' } } },
}))

function fixture() {
  const entry = ref<StudioEntry>({
    _id: 'entry',
    locale: 'en',
    slug: 'hello',
    status: 'draft',
    draftVersion: 1,
    dirtyLocales: [],
    data: { title: 'Hello' },
    draft: {},
    localeData: { draft: { values: { title: 'Hello' }, bodyMdc: 'Body.' } },
  })
  const fields = ref<StudioField[]>([
    { key: 'title', type: 'text', localized: true },
    { key: 'body', type: 'richtext', localized: true },
  ])
  let draft: ReturnType<typeof useEntryDraft> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        draft = useEntryDraft({
          entry,
          collection: ref('posts'),
          entryId: ref('entry'),
          contentRoute: '/content',
          collectionConfig: ref<StudioCollectionConfig>({
            _id: 'posts',
            mode: 'flat',
            fields: fields.value,
          }),
          isTree: ref(false),
          fields,
          sharedFields: ref([]),
          localizedFields: fields,
          currentLocale: ref('en'),
          parentPathById: ref(new Map()),
          canEditEntries: ref(true),
          studioDebug: {
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            logQueryError: vi.fn(),
            pushWithLogging: vi.fn(),
            watchQueryError: vi.fn(),
          },
          t: (key) => key,
          initialized: ref(false),
          refreshEntry: async () => {},
          richtextFlush: {
            flush: async () => ({ ok: true, emitted: false }),
            hasPending: ref(false),
            register: () => () => {},
            setPending: () => {},
          },
        })
        return () => h('div')
      },
    }),
  )
  return { wrapper, entry, draft: draft! }
}

beforeEach(() => {
  mutation.mockReset().mockResolvedValue({ draftVersion: 3 })
})

describe('entry form alongside a shared body', () => {
  it('keeps an unsaved title through a body checkpoint and saves only the title against the new version', async () => {
    const { wrapper, entry, draft } = fixture()
    await flushPromises()
    draft.dataFields.title = 'My unsaved title'
    await nextTick()
    entry.value = {
      ...entry.value,
      draftVersion: 2,
      localeData: { draft: { ...entry.value.localeData!.draft, bodyMdc: 'Shared body.' } },
    }
    await flushPromises()
    expect(draft.saveConflict.value).toBe(false)
    expect(draft.dataFields.title).toBe('My unsaved title')
    expect(draft.dataFields.body).toBe('Shared body.')
    expect(draft.isDirty.value).toBe(true)
    await draft.handleSaveDraft()
    expect(mutation).toHaveBeenCalledWith({
      entryId: 'entry',
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'My unsaved title' } } } },
    })
    wrapper.unmount()
  })

  it('blocks local source edits when a different body arrives', async () => {
    const { wrapper, entry, draft } = fixture()
    await flushPromises()
    draft.dataFields.body = 'My local source'
    await nextTick()
    entry.value = {
      ...entry.value,
      draftVersion: 2,
      localeData: { draft: { ...entry.value.localeData!.draft, bodyMdc: 'Other source' } },
    }
    await flushPromises()
    expect(draft.saveConflict.value).toBe(true)
    expect(draft.dataFields.body).toBe('My local source')
    await draft.handleSaveDraft()
    expect(mutation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reconciles a clean checkpoint when publication temporarily suppresses the version watcher', async () => {
    const { wrapper, entry, draft } = fixture()
    await flushPromises()
    draft.saving.value = true
    entry.value = {
      ...entry.value,
      draftVersion: 2,
      localeData: { draft: { ...entry.value.localeData!.draft, bodyMdc: 'Accepted shared body.' } },
    }
    await nextTick()
    expect(draft.lastHydratedVersion.value).toBe(1)
    await expect(draft.handleSaveDraft(true)).resolves.toBe(true)
    expect(draft.lastHydratedVersion.value).toBe(2)
    expect(draft.dataFields.body).toBe('Accepted shared body.')
    expect(mutation).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
