// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import StudioAssetUsageList from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetUsageList.vue'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'

const context = vi.hoisted(() => ({
  finder: {
    selectedAssetUsages: {
      value: [
        {
          sourceKind: 'draft' as const,
          sourceId: 'draft-1',
          entryId: 'entry-1',
          entryTitle: 'Home page',
          fieldPath: 'hero.image',
          locale: 'en',
          collection: 'pages',
          collectionLabel: 'Pages',
        },
      ],
    },
    selectedAssetUsagesLoading: { value: false },
    selectedAssetUsagesLoadingMore: { value: false },
    hasMoreSelectedAssetUsages: { value: true },
    loadMoreSelectedAssetUsages: vi.fn(),
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext', () => ({
  useStudioAssetBrowserContext: () => context,
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

function asset(state: 'used' | 'unused-verified' | 'unknown-stale'): FinderAssetRecord {
  return {
    id: 'asset-1',
    filename: 'hero.png',
    referenceCertainty: {
      state,
      proofCurrent: state !== 'unknown-stale',
      canonicalGeneration: 1,
      verifiedRunId: state !== 'unknown-stale' ? 'repair-1' : null,
      verifiedAt: state !== 'unknown-stale' ? 1 : null,
    },
  } as FinderAssetRecord
}

function mountUsage(state: 'used' | 'unused-verified' | 'unknown-stale' = 'used') {
  return mount(StudioAssetUsageList, {
    props: { asset: asset(state) },
    global: {
      stubs: {
        RouterLink: defineComponent({
          props: { to: String },
          template: '<a :href="to"><slot /></a>',
        }),
        Button: defineComponent({
          emits: ['click'],
          template: '<button class="load-more" @click="$emit(\'click\')"><slot /></button>',
        }),
      },
    },
  })
}

describe('StudioAssetUsageList', () => {
  beforeEach(() => context.finder.loadMoreSelectedAssetUsages.mockClear())

  it('[AST-05] links a paged canonical draft/public reference to its entry and loads the next page', async () => {
    const wrapper = mountUsage()

    expect(wrapper.get('a').attributes('href')).toBe('/content/pages/entry-1')
    expect(wrapper.text()).toContain('Home page')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.referenceSourceDraft')

    await wrapper.get('.load-more').trigger('click')
    expect(context.finder.loadMoreSelectedAssetUsages).toHaveBeenCalledOnce()
  })

  it('shows only the explicitly verified unused state as reference-free', () => {
    const wrapper = mountUsage('unused-verified')

    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.unusedVerified')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('[AST-05] shows stale or missing proof as unknown instead of unused', () => {
    const wrapper = mountUsage('unknown-stale')

    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.usageUnknownStaleHelp')
    expect(wrapper.text()).not.toContain('ginkoCms.studio.assetBrowser.unusedVerified')
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
