// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import StudioCollectionFlatList from '../../packages/cms/studio-app/src/components/studio/collections/StudioCollectionFlatList.vue'
import StudioCollectionTreeList from '../../packages/cms/studio-app/src/components/studio/collections/StudioCollectionTreeList.vue'
import type { EnrichedRow } from '../../packages/cms/studio-app/src/lib/studioCollectionRows'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

const row: EnrichedRow = {
  _can: { edit: true },
  _id: 'entry-1',
  blockingIssueCount: 0,
  data: {},
  depth: 2,
  dirtyLocales: ['de'],
  draftChangedSincePublish: true,
  draftVersion: 3,
  kind: 'page',
  localeSummaries: [
    { locale: 'en', published: true },
    { draftExists: true, locale: 'de', published: false },
  ],
  localeVariants: [
    { locale: 'en', published: true },
    { draftExists: true, locale: 'de', published: false },
  ],
  missingTranslationLocales: [],
  nextAction: 'Open entry',
  nodeKind: 'page',
  order: 'a',
  orderRank: 'a',
  parentEntryId: null,
  path: '/about',
  publicState: 'public',
  publicStateLabel: 'Live',
  publicStateTone: 'success',
  slug: 'about',
  status: 'published',
  title: 'About',
  updatedAt: 1_700_000_000_000,
}

const localeChipLabels = {
  draft: 'Draft',
  live: 'Live',
  live_with_changes: 'Live · edited',
  missing: 'Missing',
} as const

const global = {
  stubs: {
    Button: { template: '<button><slot /></button>' },
    NuxtTime: { props: ['datetime'], template: '<time>{{ datetime }}</time>' },
    RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
    StudioStatusPill: { props: ['label'], template: '<span data-status>{{ label }}</span>' },
  },
}

describe('Studio collection list renderers', () => {
  it('renders the flat row contract and forwards navigation and drag events', async () => {
    const wrapper = mount(StudioCollectionFlatList, {
      props: {
        collection: 'pages',
        contentRoute: '/studio/content',
        dateLocale: 'en',
        dropHint: null,
        hasMultipleLocales: true,
        isTree: false,
        listGridClass: 'test-grid',
        localeChipLabels,
        rows: [row],
      },
      global,
    })

    const entry = wrapper.get('[data-testid="cms-entry-row"]')
    expect(entry.classes()).toContain('studio-collection-row')
    expect(entry.text()).toContain('About')
    expect(entry.text()).toContain('/about')
    expect(entry.text()).toContain('EN · Live')
    expect(entry.text()).toContain('DE · Draft')
    expect(entry.attributes('draggable')).toBe('true')

    await entry.trigger('click')
    await entry.trigger('dragstart')
    expect(wrapper.emitted('open')).toEqual([['entry-1']])
    expect(wrapper.emitted('dragStart')).toEqual([['entry-1']])
  })

  it('renders tree depth and disables dragging without edit authority', () => {
    const wrapper = mount(StudioCollectionTreeList, {
      props: {
        collection: 'pages',
        contentRoute: '/studio/content',
        draggingId: null,
        dropHint: null,
        hasMultipleLocales: true,
        localeChipLabels,
        rows: [{ ...row, _can: { edit: false } }],
      },
      global,
    })

    const entry = wrapper.get('.ginko\\:group')
    expect(entry.attributes('draggable')).toBe('false')
    expect(entry.get('[style]').attributes('style')).toContain('padding-left: 40px')
    expect(entry.text()).toContain('EN · Live')
  })
})
