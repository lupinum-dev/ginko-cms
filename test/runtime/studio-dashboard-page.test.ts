// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioDashboardPage from '../../packages/cms/studio-app/src/pages/index.vue'

const overview = vi.hoisted(() => ({
  counts: {
    changedDrafts: 3,
    failedRevalidation: 0,
    importBlockers: 0,
    missingTranslations: 1,
    needsAttention: 1,
    pendingRevalidation: 0,
    readyToPreview: 2,
  },
  collections: [
    {
      blocked: 0,
      changedDrafts: 2,
      entryCount: 4,
      label: 'Pages',
      locales: ['en', 'de'],
      missingTranslations: 1,
      routeMode: 'route',
      slug: 'pages',
      type: 'tree',
    },
  ],
  changedDrafts: [
    {
      collection: 'pages',
      entryId: 'entry-1',
      path: '/campaign',
      publicState: 'draft_only',
      status: 'draft',
      title: 'Campaign page',
      updatedAt: 10,
    },
  ],
  readyToPreview: [
    {
      collection: 'pages',
      entryId: 'entry-2',
      path: '/ready',
      publicState: 'draft_only',
      status: 'ready',
      title: 'Ready page',
      updatedAt: 11,
    },
  ],
  blocked: [],
  missingTranslations: [],
  recentPublished: [
    {
      collection: 'pages',
      entryId: 'entry-live',
      path: '/live',
      publishedAt: 12,
      publicState: 'public',
      status: 'published',
      title: 'Live page',
      updatedAt: 12,
    },
  ],
  revalidationJobs: [],
  importRuns: [],
  activity: [
    {
      _id: 'activity-1',
      createdAt: 13,
      displaySummary: 'Published Live page.',
      kind: 'publish',
      locale: 'en',
      summary: 'Published Live page.',
    },
  ],
}))

const pendingReviews = vi.hoisted(() => [
  {
    _id: 'review-1',
    isStale: false,
    locales: ['en'],
    message: 'AI prepared the campaign page for launch.',
    requestSource: 'agent' as const,
    reviewSummary: {
      affectedPublicUrls: [{ afterHref: '/campaign', beforeHref: '/campaign-old' }],
      blockerCount: 0,
      changeCount: 2,
      warningCount: 0,
    },
    staleReason: null,
    summary: 'Ready for campaign launch.',
    title: 'Campaign page',
  },
])

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      collections: {
        listCollections: 'listCollections',
      },
      editor: {
        getStudioOverview: 'getStudioOverview',
        listActivity: 'listActivity',
      },
      reviewRequests: {
        listPendingReviews: 'listPendingReviews',
      },
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    manageAssets: 'manageAssets',
    manageSettings: 'manageSettings',
    publishEntries: 'publishEntries',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({
    collections: [],
    defaultLocale: 'en',
    route: '/studio',
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    dateLocale: 'en',
    t: (key: string) => {
      const messages: Record<string, string> = {
        'ginkoCms.studio.dashboard.headerDescription':
          'Review drafts, approvals, translation gaps, and publish blockers.',
        'ginkoCms.studio.dashboard.overviewLoadErrorDescription':
          'Existing collection data is still shown.',
        'ginkoCms.studio.dashboard.overviewLoadErrorTitle': 'Studio overview could not be loaded',
        'ginkoCms.studio.dashboard.title': 'Dashboard',
        'ginkoCms.studio.dashboard.today': 'Today',
        'ginkoCms.studio.dashboard.todayDescription':
          'Website publishing work that needs attention.',
        'ginkoCms.studio.layout.home': 'Home',
      }
      return messages[key] ?? key
    },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    can: () => ref(true),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: () => ({
    results: ref(overview.activity),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: (query: string) => {
    if (query === 'getStudioOverview') {
      return {
        data: ref(overview),
        error: ref(null),
        pending: ref(false),
      }
    }
    if (query === 'listPendingReviews') {
      return {
        data: ref(pendingReviews),
        error: ref(null),
        pending: ref(false),
      }
    }
    return {
      data: ref([]),
      error: ref(null),
      pending: ref(false),
    }
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({
    defaultLocale: ref('en'),
  }),
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
    Icon: { template: '<span />' },
    NuxtTime: { props: { datetime: [Number, String] }, template: '<time>{{ datetime }}</time>' },
    RouterLink: {
      props: { to: String },
      template: '<a :href="to"><slot /></a>',
    },
    ScrollArea: { template: '<div><slot /></div>' },
    Skeleton: { template: '<div />' },
    StudioEmptyState: {
      props: { description: String, title: String },
      template:
        '<section><slot name="icon" /><h2>{{ title }}</h2><p>{{ description }}</p><slot name="action" /></section>',
    },
    StudioNotice: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioPageHeader: {
      props: { description: String, eyebrow: String, title: String },
      template:
        '<header><span>{{ eyebrow }}</span><h1>{{ title }}</h1><p>{{ description }}</p><slot name="actions" /></header>',
    },
    StudioWorkspace: { template: '<main><slot name="header" /><slot /></main>' },
  }
}

describe('Studio dashboard page', () => {
  it('opens with the marketer publishing workflow and its current queues', () => {
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    expect(wrapper.text()).toContain('Publishing path')
    expect(wrapper.text()).toContain('Write -> Check -> Preview -> Review -> Publish -> Track')
    expect(wrapper.text()).toContain('Write')
    expect(wrapper.text()).toContain('Check')
    expect(wrapper.text()).toContain('Preview')
    expect(wrapper.text()).toContain('Review')
    expect(wrapper.text()).toContain('Publish')
    expect(wrapper.text()).toContain('Track')
    expect(wrapper.text()).toContain('Draft website content and language versions.')
    expect(wrapper.text()).toContain('Resolve blockers, missing languages, and URL issues.')
    expect(wrapper.text()).toContain('See what will change on the website.')
    expect(wrapper.text()).toContain('Approve human and AI-prepared publish requests.')
    expect(wrapper.text()).toContain('Confirm approved website changes from the entry editor.')
    expect(wrapper.text()).toContain('Verify what is live and whether refreshes succeeded.')
    expect(wrapper.text()).toContain('AI prepared this')
    expect(wrapper.text()).toContain('Already live')
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual(
      expect.arrayContaining(['/studio/content', '/studio/reviews']),
    )
  })
})
