// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioDashboardPage from '../../packages/cms/studio-app/src/pages/index.vue'

const overview = vi.hoisted(() => ({
  counts: {
    changedDrafts: 3,
    failedRevalidation: 0,
    missingTranslations: 1,
    needsAttention: 1,
    pendingRevalidation: 0,
    readyToPreview: 2,
  },
  collections: [
    {
      // Two blocker entries as the backend counts them; one is archived and
      // must be subtracted client-side (destination lists exclude archived).
      blocked: 2,
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
  blocked: [
    {
      collection: 'pages',
      entryId: 'entry-3',
      path: '/archived-probe',
      publicState: 'needs_attention',
      status: 'archived',
      title: 'Archived probe',
      updatedAt: 14,
    },
    {
      blockingIssueCount: 1,
      collection: 'pages',
      entryId: 'entry-4',
      path: '/blocked-draft',
      publicState: 'needs_attention',
      status: 'draft',
      title: 'Blocked draft',
      updatedAt: 15,
    },
  ],
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

const collectionList = vi.hoisted(() => [
  {
    _id: 'collection-1',
    entryCount: 4,
    label: 'Pages',
    locales: ['en', 'de'],
    mode: 'route',
    singleton: false,
    slug: 'pages',
    type: 'tree',
  },
])

const access = vi.hoisted(() => ({ allowed: true }))

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
    createEntries: 'createEntries',
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
        'ginkoCms.studio.collectionListPage.newEntry': 'New content',
        'ginkoCms.studio.dashboard.queueNeedsAttention': 'Needs attention',
        'ginkoCms.studio.dashboard.queueReadyToPreview': 'Ready to preview',
        'ginkoCms.studio.dashboard.queueContinueEditing': 'Continue editing',
        'ginkoCms.studio.dashboard.queueMissingLanguages': 'Missing languages',
        'ginkoCms.studio.dashboard.queueReadyForReview': 'Ready for review',
        'ginkoCms.studio.dashboard.queueAiPrepared': 'AI prepared',
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
    can: () => ref(access.allowed),
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
    if (query === 'listCollections') {
      return {
        data: ref(collectionList),
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
  beforeEach(() => {
    access.allowed = true
  })

  it('opens with the marketer publishing workflow and its current queues', () => {
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    // The publishing-path pipeline diagram is gone (design review S1 —
    // say-it-once): the queue rows are the single rendering of the workflow.
    expect(wrapper.text()).not.toContain('Publishing path')
    expect(wrapper.text()).not.toContain('Write -> Check -> Preview -> Review -> Publish -> Track')
    // All fixture queues have work, so every row renders.
    expect(wrapper.text()).toContain('Needs attention')
    expect(wrapper.text()).toContain('Ready to preview')
    expect(wrapper.text()).toContain('Continue editing')
    expect(wrapper.text()).toContain('Missing languages')
    expect(wrapper.text()).toContain('Ready for review')
    expect(wrapper.text()).toContain('AI prepared')
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toContain('/studio/reviews')
    // Ready to preview has no list filter that reproduces its count, so the
    // row stays unlinked; /studio/content is a dead route (NAV-01).
    expect(hrefs).not.toContain('/studio/content')
  })

  it('deep-links queue rows per collection with the matching filter', () => {
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/studio/content/pages?work=blocked',
        '/studio/content/pages?work=changed',
        '/studio/content/pages?work=missing_translation',
      ]),
    )
    // Rows carry the collection so the count matches the destination list.
    expect(wrapper.text()).toContain('Continue editing · Pages')
    // Review queues keep pointing at the approvals page.
    expect(hrefs).toContain('/studio/reviews')
  })

  it('excludes archived entries from queue counts and the blocked card', () => {
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    // Raw blocked count is 2, but one entry is archived: destination lists
    // exclude archived, so the row must count 1 to match its link target.
    const blockedRow = wrapper
      .findAll('a')
      .find((link) => link.attributes('href') === '/studio/content/pages?work=blocked')
    expect(blockedRow?.text()).toContain('1')
    expect(wrapper.text()).toContain('Blocked draft')
    expect(wrapper.text()).not.toContain('Archived probe')
  })

  it('offers New content as the primary header action when entries can be created', () => {
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    const newContentLink = wrapper
      .findAll('a')
      .find((link) => link.attributes('href') === '/studio/content/pages/new')
    expect(newContentLink).toBeDefined()
    expect(newContentLink?.text()).toContain('New content')
  })

  it('hides the New content action without the createEntries capability', () => {
    access.allowed = false
    const wrapper = mount(StudioDashboardPage, {
      global: {
        stubs: stubs(),
      },
    })

    expect(
      wrapper.findAll('a').some((link) => link.attributes('href') === '/studio/content/pages/new'),
    ).toBe(false)
  })
})
