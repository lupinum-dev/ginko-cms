// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioDashboardPage from '../../packages/cms/studio-app/src/pages/index.vue'

const overview = vi.hoisted(() => ({
  recentPublished: [
    {
      collection: 'pages',
      collectionLabel: 'Pages',
      entryId: 'entry-live',
      nextAction: 'Verify public output',
      path: '/live',
      publishedAt: 12,
      title: 'Live page',
      updatedAt: 12,
    },
  ],
  revalidationJobs: [],
}))

const workQueue = vi.hoisted(() => [
  {
    entry: {
      collection: 'pages',
      collectionLabel: 'Pages',
      entryId: 'entry-blocked',
      nextAction: 'Resolve readiness issues',
      title: 'Blocked draft',
      updatedAt: 15,
    },
    queueKinds: ['changed', 'needs_attention'],
  },
  {
    entry: {
      collection: 'pages',
      collectionLabel: 'Pages',
      entryId: 'entry-translation',
      nextAction: 'Complete translations',
      title: 'Localized campaign',
      updatedAt: 14,
    },
    queueKinds: ['changed', 'missing_translation'],
  },
])

const activity = vi.hoisted(() => [
  {
    _id: 'activity-1',
    createdAt: 13,
    displaySummary: 'Published Live page.',
  },
])

const collectionList = vi.hoisted(() => [
  {
    _id: 'pages',
    label: 'Pages',
    locales: ['en', 'de'],
    mode: 'route',
    singleton: false,
    slug: 'pages',
    type: 'tree',
  },
])

const pendingReviews = vi.hoisted(() => [{ _id: 'review-1', requestSource: 'agent' }])
const access = vi.hoisted(() => ({ allowed: true }))
const workQueueStatus = vi.hoisted(() => ({ value: 'ready' }))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      collections: { listCollections: 'listCollections' },
      editor: {
        getStudioOverview: 'getStudioOverview',
        listActivity: 'listActivity',
        listStudioWorkQueue: 'listStudioWorkQueue',
      },
      reviewRequests: { listPendingReviews: 'listPendingReviews' },
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    createEntries: 'createEntries',
    publishEntries: 'publishEntries',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({ route: '/studio' }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    dateLocale: 'en',
    t: (key: string) => {
      const messages: Record<string, string> = {
        'ginkoCms.studio.collectionListPage.newEntry': 'New content',
        'ginkoCms.studio.dashboard.queueNeedsAttention': 'Needs attention',
        'ginkoCms.studio.dashboard.queueContinueEditing': 'Continue editing',
        'ginkoCms.studio.dashboard.queueMissingLanguages': 'Missing languages',
        'ginkoCms.studio.dashboard.queueReadyForReview': 'Ready for review',
        'ginkoCms.studio.dashboard.headerDescription': 'Review current editorial work.',
        'ginkoCms.studio.dashboard.title': 'Dashboard',
        'ginkoCms.studio.dashboard.today': 'Today',
        'ginkoCms.studio.dashboard.todayDescription': 'Work that needs attention.',
      }
      return messages[key] ?? key
    },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({ can: () => ref(access.allowed) }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: (query: string) => ({
    error: ref(null),
    hasNextPage: ref(false),
    isExhausted: ref(true),
    isLoading: ref(false),
    loadMore: vi.fn(),
    results: ref(query === 'listStudioWorkQueue' ? workQueue : activity),
    status: query === 'listStudioWorkQueue' ? workQueueStatus : ref('ready'),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: (query: string) => {
    const data =
      query === 'getStudioOverview'
        ? overview
        : query === 'listCollections'
          ? collectionList
          : query === 'listPendingReviews'
            ? pendingReviews
            : []
    return { data: ref(data), error: ref(null), pending: ref(false) }
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({ defaultLocale: ref('en') }),
}))

function stubs() {
  return {
    Badge: { props: { variant: String }, template: '<span><slot /></span>' },
    Button: defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template:
        '<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
    }),
    NuxtTime: { props: { datetime: [Number, String] }, template: '<time>{{ datetime }}</time>' },
    RouterLink: { props: { to: String }, template: '<a :href="to"><slot /></a>' },
    ScrollArea: { template: '<div><slot /></div>' },
    StudioEmptyState: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioNotice: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioPageBody: { template: '<div><slot /></div>' },
    StudioPageHeader: {
      props: { description: String, title: String },
      template:
        '<header><h1>{{ title }}</h1><p>{{ description }}</p><slot name="actions" /></header>',
    },
    StudioWorkspace: { template: '<main><slot name="header" /><slot /></main>' },
  }
}

describe('Studio dashboard page', () => {
  beforeEach(() => {
    access.allowed = true
    workQueueStatus.value = 'ready'
  })

  it('[NAV-01] renders bounded actionable entries without partial category counts', () => {
    const wrapper = mount(StudioDashboardPage, { global: { stubs: stubs() } })
    expect(wrapper.text()).toContain('Blocked draft')
    expect(wrapper.text()).toContain('Needs attention')
    expect(wrapper.text()).toContain('Localized campaign')
    expect(wrapper.text()).toContain('Missing languages')
    expect(wrapper.text()).toContain('Ready for review')
    expect(wrapper.text()).not.toContain('Archived probe')

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/studio/content/pages/entry-blocked',
        '/studio/content/pages/entry-translation',
        '/studio/reviews',
      ]),
    )
    expect(hrefs.some((href) => href?.includes('?work='))).toBe(false)
  })

  it('offers New content as the primary header action when permitted', () => {
    const wrapper = mount(StudioDashboardPage, { global: { stubs: stubs() } })
    expect(
      wrapper.findAll('a').some((link) => link.attributes('href') === '/studio/content/pages/new'),
    ).toBe(true)
  })

  it('hides New content without create permission', () => {
    access.allowed = false
    const wrapper = mount(StudioDashboardPage, { global: { stubs: stubs() } })
    expect(
      wrapper.findAll('a').some((link) => link.attributes('href') === '/studio/content/pages/new'),
    ).toBe(false)
  })

  it('reserves the work-queue footprint while its first page is settling', () => {
    workQueueStatus.value = 'loading-first-page'
    const wrapper = mount(StudioDashboardPage, { global: { stubs: stubs() } })
    const status = wrapper.get('[role="status"]')
    expect(status.attributes('aria-busy')).toBe('true')
    expect(status.findAll('[aria-hidden="true"]')).toHaveLength(8)
    expect(wrapper.text()).not.toContain('Blocked draft')
  })
})
