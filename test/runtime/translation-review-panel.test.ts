// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import StudioTranslationReview from '../../packages/cms/studio-app/src/components/studio/editor/StudioTranslationReview.vue'

function fixture() {
  return {
    entryId: 'entry-1',
    targetLocale: 'de',
    sourceLocale: 'en',
    reviewId: 'link-1',
    status: 'needs-review',
    reason: 'unreviewed',
    sourceVersion: 3,
    targetVersion: 2,
    sourceDraftId: 'en-draft',
    targetDraftId: 'de-draft',
    sharedVersion: 1,
    source: {
      values: { title: 'A living world' },
      shared: {},
      bodyMdc: 'Source article',
      slug: null,
    },
    target: {
      values: { title: 'Eine lebendige Welt' },
      shared: {},
      bodyMdc: 'Deutscher Artikel',
      slug: null,
    },
    reviewedSource: null,
    changedFields: ['values.title', 'bodyMdc'],
    changedTargetFields: [],
    reviewedAt: null,
    reviewedBy: null,
    _can: { edit: true },
  }
}
const queryData = ref(fixture())
const actions = vi.hoisted(() => ({
  setSource: vi.fn(),
  acknowledge: vi.fn(),
  refresh: vi.fn(),
  flush: vi.fn(),
}))
vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      editor: {
        getTranslationReview: 'get',
        setTranslationSource: 'source',
        acknowledgeTranslationReview: 'ack',
      },
    },
  },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: queryData,
    refresh: actions.refresh,
    error: ref(null),
    pending: ref(false),
  }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: (name: string) => (name === 'ack' ? actions.acknowledge : actions.setSource),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string) => key.split('.').at(-1),
    dateLocale: ref('en'),
    currentLocale: ref('de'),
  }),
}))
vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

beforeEach(() => {
  queryData.value = fixture()
  for (const action of Object.values(actions)) action.mockReset().mockResolvedValue(true)
})
function render() {
  return mount(StudioTranslationReview, {
    props: {
      entryId: 'entry-1',
      targetLocale: 'de',
      fields: [{ key: 'title', label: { en: 'Headline', de: 'Überschrift' } }],
      localeOptions: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
      flushPending: actions.flush,
    },
  })
}
async function click(wrapper: ReturnType<typeof render>, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  if (!button) throw new Error(`Missing button ${label}`)
  await button.trigger('click')
  await flushPromises()
}

describe('translation review panel', () => {
  it('shows source and target article text and confirms exactly the inspected versions after flushing', async () => {
    const wrapper = render()
    await click(wrapper, 'start')
    expect(wrapper.text()).toContain('Source article')
    expect(wrapper.find('h4').text()).toBe('Überschrift')
    expect(wrapper.text()).toContain('Deutscher Artikel')
    await click(wrapper, 'confirm')
    expect(actions.flush).toHaveBeenCalledTimes(2)
    expect(actions.acknowledge).toHaveBeenCalledWith({
      entryId: 'entry-1',
      targetLocale: 'de',
      expectedReviewId: 'link-1',
      expectedTargetVersion: 2,
      expectedSharedVersion: 1,
      expectedSourceVersion: 3,
      expectedSourceDraftId: 'en-draft',
      expectedTargetDraftId: 'de-draft',
    })
    wrapper.unmount()
  })

  it('keeps inspected text frozen and requires reviewing again when another member edits the source', async () => {
    const wrapper = render()
    await click(wrapper, 'start')
    queryData.value = {
      ...fixture(),
      sourceVersion: 4,
      source: { ...fixture().source, values: { title: 'Another member changed this' } },
    }
    await nextTick()
    expect(wrapper.text()).toContain('A living world')
    expect(wrapper.text()).not.toContain('Another member changed this')
    expect(wrapper.findAll('button').some((button) => button.text() === 'confirm')).toBe(false)
    await click(wrapper, 'restart')
    expect(wrapper.text()).toContain('Another member changed this')
    await click(wrapper, 'confirm')
    expect(actions.acknowledge.mock.calls[0]?.[0]).toMatchObject({ expectedSourceVersion: 4 })
    wrapper.unmount()
  })

  it('does not acknowledge newer text when the save flush updates the target during confirmation', async () => {
    const wrapper = render()
    await click(wrapper, 'start')
    actions.flush.mockImplementationOnce(async () => {
      queryData.value = { ...fixture(), targetVersion: 3 }
      return true
    })
    await click(wrapper, 'confirm')
    expect(actions.acknowledge).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('stale')
    wrapper.unmount()
  })

  it('keeps review actions read-only for a viewer and blocks review while saving fails', async () => {
    queryData.value = { ...fixture(), _can: { edit: false } }
    const viewer = render()
    expect(viewer.get('select').attributes('disabled')).toBeDefined()
    await click(viewer, 'start')
    expect(viewer.findAll('button').some((button) => button.text() === 'confirm')).toBe(false)
    viewer.unmount()
    queryData.value = fixture()
    const editor = render()
    actions.flush.mockResolvedValue(false)
    await click(editor, 'start')
    expect(editor.text()).toContain('saveFirst')
    expect(actions.acknowledge).not.toHaveBeenCalled()
    editor.unmount()
  })
  it('preserves another member’s relationship review when it changes during the source-choice flush', async () => {
    const wrapper = render()
    let finishFlush: ((saved: boolean) => void) | undefined
    actions.flush.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishFlush = resolve
        }),
    )
    await wrapper.get('select').setValue('__independent__')
    expect(actions.setSource).not.toHaveBeenCalled()
    queryData.value = { ...fixture(), reviewId: 'reviewed-by-colleague', status: 'reviewed' }
    await nextTick()
    finishFlush?.(true)
    await flushPromises()
    expect(actions.setSource).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('stale')
    expect(queryData.value.reviewId).toBe('reviewed-by-colleague')
    expect(wrapper.get<HTMLSelectElement>('select').element.value).toBe('en')
    wrapper.unmount()
  })

  it('uses the inspected relationship fence with the newly saved target version for a source choice', async () => {
    const wrapper = render()
    actions.flush.mockImplementationOnce(async () => {
      queryData.value = { ...fixture(), targetVersion: 4 }
      return true
    })
    await wrapper.get('select').setValue('__independent__')
    await flushPromises()
    expect(actions.setSource).toHaveBeenCalledWith({
      entryId: 'entry-1',
      targetLocale: 'de',
      expectedReviewId: 'link-1',
      expectedTargetDraftId: 'de-draft',
      expectedTargetVersion: 4,
      expectedSharedVersion: 1,
      sourceLocale: null,
    })
    wrapper.unmount()
  })
})
