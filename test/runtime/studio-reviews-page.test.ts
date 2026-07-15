// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import StudioReviewsPage from '../../packages/cms/studio-app/src/pages/reviews.vue'
import { provideRightSidebar } from '../../packages/cms/studio-app/src/composables/useRightSidebar'

// The reviews page registers a right-sidebar details panel, so mounting it needs
// the layout's right-sidebar controller (provideRightSidebar) in an ancestor plus
// the jsdom globals its VueUse dependencies read.
function installLocalStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => {
        values.delete(key)
      },
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    } satisfies Storage,
  })
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function mountReviewsPage() {
  installLocalStorage()
  installMatchMedia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/reviews',
        name: 'studio-reviews',
        meta: { rightSidebar: true },
        component: { render: () => h('div') },
      },
    ],
  })
  router.push('/reviews')
  // Layout harness that provides the right-sidebar controller the page registers into.
  const Harness = defineComponent({
    setup() {
      provideRightSidebar()
      return () => h(StudioReviewsPage)
    },
  })
  return mount(Harness, {
    global: {
      plugins: [router],
      stubs: stubs(),
    },
  })
}

const pendingReviews = vi.hoisted(() => [
  {
    _id: 'review-1',
    agentRunId: 'agent-run-1',
    requestSource: 'agent' as const,
    operationId: 'operation-1',
    entryId: 'entry-1',
    locales: ['en'],
    expectedVersion: 7,
    message: 'I updated the SEO title and checked the English page URL.',
    title: 'Campaign landing page',
    summary: 'Ready for campaign launch.',
    status: 'pending' as const,
    preview: {
      kind: 'publish-review-preview' as const,
      status: 'ready' as const,
      collection: 'pages',
      entryId: 'entry-1',
      locales: [
        {
          locale: 'en',
          status: 'ready' as const,
          currentHref: '/campaign-old',
          nextHref: '/campaign',
          blockingIssueCodes: [],
          warningIssueCodes: [],
          changeKinds: ['seo' as const, 'route' as const],
        },
      ],
      affectedPublicUrls: [
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          label: 'English page',
          beforeHref: '/campaign-old',
          afterHref: '/campaign',
        },
      ],
      changes: [
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          kind: 'seo' as const,
          label: 'SEO title',
          before: 'Old campaign title',
          after: 'New campaign title',
        },
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          kind: 'seo' as const,
          label: 'SEO description',
          before: 'Old campaign description',
          after: 'New campaign description',
        },
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          kind: 'route' as const,
          label: 'Page URL',
          before: '/campaign-old',
          after: '/campaign',
        },
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          kind: 'nav' as const,
          label: 'Nav inclusion',
          before: false,
          after: true,
        },
      ],
      blockingIssueCodes: [],
      warningIssueCodes: [],
      computedAt: 1,
    },
    requestedBy: 'agent',
    reviewedBy: null,
    createdAt: 1,
    updatedAt: 1,
    reviewedAt: null,
    versionHash: 'version-hash',
    isStale: false,
    staleReason: null,
    reviewSummary: {
      status: 'ready' as const,
      localeStatuses: [
        {
          locale: 'en',
          status: 'ready' as const,
          currentHref: '/campaign-old',
          nextHref: '/campaign',
        },
      ],
      affectedPublicUrls: [
        {
          locale: 'en',
          entryId: 'entry-1',
          scope: 'current_entry' as const,
          label: 'English page',
          beforeHref: '/campaign-old',
          afterHref: '/campaign',
        },
      ],
      changeCount: 4,
      blockerCount: 0,
      warningCount: 0,
      blockingIssueCodes: [],
      warningIssueCodes: [],
    },
  },
])

const messages = vi.hoisted<Record<string, string>>(() => ({
  'ginkoCms.common.cancel': 'Cancel',
  'ginkoCms.studio.layout.publishing': 'Publishing',
  'ginkoCms.studio.reviewsPage.affectedLocales': 'Languages',
  'ginkoCms.studio.reviewsPage.affectedPages': 'Affected pages',
  'ginkoCms.studio.reviewsPage.accessRequired':
    'You need publish access to approve and publish website changes.',
  'ginkoCms.studio.reviewsPage.after': 'After',
  'ginkoCms.studio.reviewsPage.afterPublish': 'After publish',
  'ginkoCms.studio.reviewsPage.aiManualCheck':
    'Check the assistant summary against the brief before approving.',
  'ginkoCms.studio.reviewsPage.aiPreparedTitle': 'AI assistant prepared this',
  'ginkoCms.studio.reviewsPage.approvalDialogDescription':
    'This approval can publish the requested content changes to the website.',
  'ginkoCms.studio.reviewsPage.approvalDialogTitle': 'Approve and publish?',
  'ginkoCms.studio.reviewsPage.approveButton': 'Approve and publish',
  'ginkoCms.studio.reviewsPage.assistantPreparedList': 'What the assistant prepared',
  'ginkoCms.studio.reviewsPage.assistantSummary': 'Assistant summary',
  'ginkoCms.studio.reviewsPage.before': 'Before',
  'ginkoCms.studio.reviewsPage.blockers': 'Blockers',
  'ginkoCms.studio.reviewsPage.changeLabelCanonicalUrl': 'Canonical URL',
  'ginkoCms.studio.reviewsPage.changeLabelNavigation': 'Navigation',
  'ginkoCms.studio.reviewsPage.changeLabelOldUrlRedirect': 'Old URL redirect',
  'ginkoCms.studio.reviewsPage.changeLabelPageUrl': 'Page URL',
  'ginkoCms.studio.reviewsPage.changeLabelSearch': 'Search',
  'ginkoCms.studio.reviewsPage.changeLabelSitemap': 'Sitemap',
  'ginkoCms.studio.reviewsPage.changeValueEmpty': 'Empty',
  'ginkoCms.studio.reviewsPage.changeValueExcluded': 'Excluded',
  'ginkoCms.studio.reviewsPage.changeValueIncluded': 'Included',
  'ginkoCms.studio.reviewsPage.changeValueNotSet': 'Not set',
  'ginkoCms.studio.reviewsPage.currentDraftRequest': 'Based on the current draft',
  'ginkoCms.studio.reviewsPage.currentLivePage': 'Current live page',
  'ginkoCms.studio.reviewsPage.description': 'Review pending website changes',
  'ginkoCms.studio.reviewsPage.empty': 'No pending approvals',
  'ginkoCms.studio.reviewsPage.emptyDescription':
    'Pending website changes will appear here for approval or rejection.',
  'ginkoCms.studio.reviewsPage.entryId': 'Entry id',
  'ginkoCms.studio.reviewsPage.expectedDraftVersion': 'Saved draft state',
  'ginkoCms.studio.reviewsPage.fieldChanges': 'Detailed website changes',
  'ginkoCms.studio.reviewsPage.humanPreparedTitle': 'Review requested',
  'ginkoCms.studio.reviewsPage.hiddenChangesOne': '{count} more change in advanced details.',
  'ginkoCms.studio.reviewsPage.hiddenChangesOther': '{count} more changes in advanced details.',
  'ginkoCms.studio.reviewsPage.noAffectedPages': 'No public page URL changes reported.',
  'ginkoCms.studio.reviewsPage.noLanguagesSelected': 'No language selected',
  'ginkoCms.studio.reviewsPage.noPageUrlPlanned': 'No page URL planned',
  'ginkoCms.studio.reviewsPage.noPreviewChanges': 'No detailed website changes were reported.',
  'ginkoCms.studio.reviewsPage.noReviewConcerns':
    'No blockers or warnings reported in the publish preview.',
  'ginkoCms.studio.reviewsPage.notLiveYet': 'Not live yet',
  'ginkoCms.studio.reviewsPage.otherWebsiteChanges': 'Other website changes',
  'ginkoCms.studio.reviewsPage.outOfDateRequest': 'Out of date request',
  'ginkoCms.studio.reviewsPage.pageAddress': 'Page address',
  'ginkoCms.studio.reviewsPage.pendingBadge': '{count} pending',
  'ginkoCms.studio.reviewsPage.preparedBlocked': '{count} must be resolved before publishing.',
  'ginkoCms.studio.reviewsPage.preparedChangesOne': '{count} website change prepared',
  'ginkoCms.studio.reviewsPage.preparedChangesOther': '{count} website changes prepared',
  'ginkoCms.studio.reviewsPage.preparedLanguages': 'Prepared languages',
  'ginkoCms.studio.reviewsPage.preparedNoAffectedPages': 'No affected website pages',
  'ginkoCms.studio.reviewsPage.preparedNoChanges': 'No website changes prepared',
  'ginkoCms.studio.reviewsPage.preparedPagesOne': '{count} affected website page',
  'ginkoCms.studio.reviewsPage.preparedPagesOther': '{count} affected website pages',
  'ginkoCms.studio.reviewsPage.preparedReady': 'No blockers or warnings reported.',
  'ginkoCms.studio.reviewsPage.preparedStale': 'This review is out of date.',
  'ginkoCms.studio.reviewsPage.preparedWarnings': '{count} to review before publishing.',
  'ginkoCms.studio.reviewsPage.previewBlockersOne': '{count} blocker',
  'ginkoCms.studio.reviewsPage.previewBlockersOther': '{count} blockers',
  'ginkoCms.studio.reviewsPage.previewChangesOne': '{count} change',
  'ginkoCms.studio.reviewsPage.previewChangesOther': '{count} changes',
  'ginkoCms.studio.reviewsPage.previewWarningsOne': '{count} warning',
  'ginkoCms.studio.reviewsPage.previewWarningsOther': '{count} warnings',
  'ginkoCms.studio.reviewsPage.publishDecision': 'Publish decision',
  'ginkoCms.studio.reviewsPage.publishDecisionBlockers':
    '{count} must be resolved before publishing.',
  'ginkoCms.studio.reviewsPage.publishDecisionWarnings': '{count} to review before publishing.',
  'ginkoCms.studio.reviewsPage.publishImpact': 'Website changes',
  'ginkoCms.studio.reviewsPage.readyDecision': 'Ready to approve and publish.',
  'ginkoCms.studio.reviewsPage.rejectButton': 'Reject',
  'ginkoCms.studio.reviewsPage.requested': 'Requested',
  'ginkoCms.studio.reviewsPage.requestedBy': 'Requested by',
  'ginkoCms.studio.reviewsPage.requestPreparedList': 'What is ready for review',
  'ginkoCms.studio.reviewsPage.requestSourceAgent': 'Prepared by AI',
  'ginkoCms.studio.reviewsPage.requestSourceHuman': 'Requested by a person',
  'ginkoCms.studio.reviewsPage.requestSummary': 'Request note',
  'ginkoCms.studio.reviewsPage.requestId': 'Request id',
  'ginkoCms.studio.reviewsPage.reviewCheckBlockers': '{count} must be resolved.',
  'ginkoCms.studio.reviewsPage.reviewCheckWarnings': '{count} to review.',
  'ginkoCms.studio.reviewsPage.reviewStatusBlocked': 'Needs work',
  'ginkoCms.studio.reviewsPage.reviewStatusNoChanges': 'No website changes',
  'ginkoCms.studio.reviewsPage.reviewStatusNotPublishable': 'Cannot publish',
  'ginkoCms.studio.reviewsPage.reviewStatusReady': 'Ready to publish',
  'ginkoCms.studio.reviewsPage.reviewStatusUnknown': 'Needs review',
  'ginkoCms.studio.reviewsPage.searchPreview': 'Search preview',
  'ginkoCms.studio.reviewsPage.seoSettings': 'SEO settings',
  'ginkoCms.studio.reviewsPage.staleCheck': 'Refresh this request before approval.',
  'ginkoCms.studio.reviewsPage.statusOutOfDate': 'Out of date',
  'ginkoCms.studio.reviewsPage.statusPending': 'Pending',
  'ginkoCms.studio.reviewsPage.title': 'Approvals',
  'ginkoCms.studio.reviewsPage.versionState': 'Request status',
  'ginkoCms.studio.reviewsPage.warnings': 'Warnings',
  'ginkoCms.studio.reviewsPage.websiteVisibility': 'Website visibility',
  'ginkoCms.studio.reviewsPage.whatChanged': 'What changed',
  'ginkoCms.studio.reviewsPage.whatToCheck': 'What to check before approval',
  'ginkoCms.studio.reviewsPage.viewDetails': 'Details',
  'ginkoCms.studio.reviewDetails.title': 'Review details',
}))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      reviewRequests: {
        approveReview: 'approveReview',
        listPendingReviews: 'listPendingReviews',
        rejectReview: 'rejectReview',
      },
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    publishEntries: 'publishEntries',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    dateLocale: 'en',
    t: (key: string, params?: Record<string, unknown>) => {
      const message = messages[key] ?? key
      return params
        ? Object.entries(params).reduce(
            (value, [param, replacement]) => value.replace(`{${param}}`, String(replacement)),
            message,
          )
        : message
    },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    can: () => ref(true),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: ref(pendingReviews),
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () =>
    Object.assign(
      vi.fn(async () => undefined),
      {
        pending: ref(false),
      },
    ),
}))

vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_error: unknown, fallback: string) => fallback,
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
    Dialog: { props: { open: Boolean }, template: '<div v-if="open"><slot /></div>' },
    DialogContent: { template: '<div><slot /></div>' },
    DialogDescription: { template: '<p><slot /></p>' },
    DialogFooter: { template: '<footer><slot /></footer>' },
    DialogHeader: { template: '<header><slot /></header>' },
    DialogTitle: { template: '<h2><slot /></h2>' },
    NuxtTime: { props: { datetime: [Number, String] }, template: '<time>{{ datetime }}</time>' },
    ScrollArea: { template: '<div><slot /></div>' },
    Skeleton: { template: '<div />' },
    StudioDeveloperDetails: { template: '<details><summary>Advanced details</summary></details>' },
    StudioEmptyState: {
      props: { description: String, title: String },
      template:
        '<section><slot name="icon" /><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioPageHeader: {
      props: { description: String, eyebrow: String, title: String },
      template:
        '<header><span>{{ eyebrow }}</span><h1>{{ title }}</h1><p>{{ description }}</p><slot name="actions" /></header>',
    },
    StudioWorkspace: { template: '<main><slot name="header" /><slot /></main>' },
  }
}

describe('Studio reviews page', () => {
  it('surfaces AI-prepared website changes as a marketer approval summary', () => {
    const wrapper = mountReviewsPage()

    expect(wrapper.text()).toContain('AI assistant prepared this')
    expect(wrapper.text()).toContain('Assistant summary')
    expect(wrapper.text()).toContain('I updated the SEO title and checked the English page URL.')
    expect(wrapper.text()).toContain('Prepared languages')
    expect(wrapper.text()).toContain('Website changes')
    expect(wrapper.text()).toContain('Ready to publish · 4 changes')
    expect(wrapper.text()).toContain('Publish decision')
    expect(wrapper.text()).toContain('Ready to approve and publish.')
    expect(wrapper.text()).toContain('What the assistant prepared')
    expect(wrapper.text()).toContain('4 website changes prepared')
    expect(wrapper.text()).toContain('1 affected website page')
    expect(wrapper.text()).toContain('No blockers or warnings reported.')
    expect(wrapper.text()).toContain('What changed')
    expect(wrapper.text()).toContain('What to check before approval')
    expect(wrapper.text()).toContain('Detailed website changes')
    expect(wrapper.text()).toContain('Page address')
    expect(wrapper.text()).toContain('Search preview')
    expect(wrapper.text()).toContain('Website visibility')
    expect(wrapper.text()).toContain('Current live page')
    expect(wrapper.text()).toContain('After publish')
    expect(wrapper.text()).toContain('Page URL')
    expect(wrapper.text()).toContain('Old campaign title')
    expect(wrapper.text()).toContain('New campaign title')
    expect(wrapper.text()).toContain('Old campaign description')
    expect(wrapper.text()).toContain('New campaign description')
    expect(wrapper.text()).toContain('Navigation')
    expect(wrapper.text()).toContain('Excluded')
    expect(wrapper.text()).toContain('Included')
    expect(wrapper.text()).not.toContain('Old campaign title -> New campaign title')
    expect(wrapper.text()).not.toContain('/campaign-old -> /campaign')
    expect(wrapper.text()).not.toContain('false -> true')
    expect(wrapper.text()).toContain('No blockers or warnings reported in the publish preview.')
    expect(wrapper.text()).toContain(
      'Check the assistant summary against the brief before approving.',
    )
  })
})
