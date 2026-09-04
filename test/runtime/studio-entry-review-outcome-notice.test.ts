// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'

import en from '../../packages/cms/src/public/locales/en'
import StudioEntryReviewOutcomeNotice from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryReviewOutcomeNotice.vue'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'

// The notice reads the recent-outcomes query through useCmsStudioQuery; the
// mock exposes the ref so each test controls the deployed payload shape.
const outcomesData = ref<unknown>(null)
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: outcomesData,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

function dictionaryT(messages: unknown) {
  return (key: string, params?: Record<string, unknown>, defaultValue?: string) => {
    let value: unknown = messages
    for (const segment of key.split('.')) {
      value =
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    }
    if (typeof value !== 'string') return defaultValue ?? key
    return Object.entries(params ?? {}).reduce(
      (message, [paramKey, paramValue]) => message.replaceAll(`{${paramKey}}`, String(paramValue)),
      value,
    )
  }
}

function rejectedOutcome(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'review-1',
    entryId: 'entry-1',
    status: 'rejected',
    title: 'Publish blog (EN)',
    locales: ['en'],
    expectedVersion: 1,
    createdAt: 1_000,
    reviewedBy: 'publisher-1',
    reviewedByLabel: 'Pat Publisher',
    reviewedAt: 2_000,
    reviewFeedback: 'Tighten the intro before the next review.',
    ...overrides,
  }
}

function readinessDetail(overrides: Record<string, unknown> = {}) {
  return {
    entryId: 'entry-1',
    collection: 'blog',
    primaryLocale: 'en',
    updatedAt: Date.now(),
    locales: [
      {
        locale: 'en',
        state: 'ready',
        reviewRequestId: null,
        canRequestReview: true,
        ...overrides,
      },
    ],
  }
}

function mountNotice({
  entryUpdatedAt,
  detail = readinessDetail(),
  requestPublishReview = vi.fn(),
}: {
  entryUpdatedAt: number
  detail?: Record<string, unknown>
  requestPublishReview?: () => void
}) {
  const editor = reactive({
    loader: {
      t: dictionaryT(en),
      entryId: 'entry-1',
      currentLocale: 'en',
      dateLocale: 'en',
      entry: { updatedAt: entryUpdatedAt },
    },
    workflow: {
      requestReviewPending: false,
      requestPublishReview,
    },
  })
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(StudioEntryReviewOutcomeNotice, { readinessDetail: detail as never })
    },
  })
  return mount(Host, {
    global: {
      stubs: {
        StudioNotice: defineComponent({
          props: { tone: String, title: String },
          template: '<div><strong>{{ title }}</strong><slot /><slot name="action" /></div>',
        }),
        Button: defineComponent({
          template: '<button><slot /></button>',
        }),
        NuxtTime: defineComponent({
          props: { datetime: [Number, String] },
          template: '<time>{{ datetime }}</time>',
        }),
      },
    },
  })
}

describe('StudioEntryReviewOutcomeNotice (PUB-06 rejected loop)', () => {
  it('shows reviewer feedback when the latest outcome is a rejection newer than the last save', async () => {
    outcomesData.value = [rejectedOutcome()]
    const requestPublishReview = vi.fn()
    const wrapper = mountNotice({ entryUpdatedAt: 1_500, requestPublishReview })

    expect(wrapper.text()).toContain('Changes requested')
    expect(wrapper.text()).toContain('Tighten the intro before the next review.')
    expect(wrapper.text()).toContain('Returned by Pat Publisher')
    expect(wrapper.text()).toContain('Request review again')

    await wrapper.find('button').trigger('click')
    expect(requestPublishReview).toHaveBeenCalledTimes(1)
  })

  it('offers continue-editing guidance instead of the button when review cannot be requested', () => {
    outcomesData.value = [rejectedOutcome()]
    const wrapper = mountNotice({
      entryUpdatedAt: 1_500,
      detail: readinessDetail({ canRequestReview: false }),
    })

    expect(wrapper.text()).toContain('Changes requested')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('Continue editing, then request a new review.')
  })

  it('falls back to calm copy when the rejection carries no written feedback', () => {
    outcomesData.value = [rejectedOutcome({ reviewFeedback: null, reviewedByLabel: null })]
    const wrapper = mountNotice({ entryUpdatedAt: 1_500 })

    expect(wrapper.text()).toContain('A reviewer returned this without written feedback.')
    expect(wrapper.text()).toContain('Returned ·')
  })

  it('disappears after the editor saves a newer draft', () => {
    outcomesData.value = [rejectedOutcome()]
    const wrapper = mountNotice({ entryUpdatedAt: 3_000 })

    expect(wrapper.text()).not.toContain('Changes requested')
  })

  it('disappears once a newer review request is pending', () => {
    outcomesData.value = [rejectedOutcome()]
    const wrapper = mountNotice({
      entryUpdatedAt: 1_500,
      detail: readinessDetail({ reviewRequestId: 'review-2', state: 'in_review' }),
    })

    expect(wrapper.text()).not.toContain('Changes requested')
  })

  it('stays hidden when the latest outcome is an approval', () => {
    outcomesData.value = [rejectedOutcome({ status: 'approved', reviewFeedback: null })]
    const wrapper = mountNotice({ entryUpdatedAt: 1_500 })

    expect(wrapper.text()).not.toContain('Changes requested')
  })
})
