// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import StudioAssetTrashDialog from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetTrashDialog.vue'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import { executePendingAssetTrash } from '../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

function stubs() {
  return {
    StudioConfirmDialog: defineComponent({
      props: { open: Boolean, title: String, description: String, confirmLabel: String },
      emits: ['update:open', 'confirm'],
      template: `<div v-if="open" class="dialog">
        <h2 class="title">{{ title }}</h2>
        <slot />
        <button class="confirm" @click="$emit('confirm')">confirm</button>
        <button class="cancel" @click="$emit('update:open', false)">cancel</button>
      </div>`,
    }),
    StudioNotice: {
      props: ['tone', 'title', 'description'],
      template: '<div class="notice" :data-tone="tone">{{ title }}</div>',
    },
  }
}

function asset(overrides: Partial<FinderAssetRecord> = {}): FinderAssetRecord {
  return {
    id: 'asset_1',
    filename: 'hero.jpg',
    referenceCertainty: {
      state: 'unused-verified',
      proofCurrent: true,
      canonicalGeneration: 1,
      verifiedRunId: 'repair-1',
      verifiedAt: 1,
    },
    ...overrides,
  } as unknown as FinderAssetRecord
}

describe('StudioAssetTrashDialog', () => {
  it('executes one already-confirmed trash operation for single and bulk actions', async () => {
    const trashAssets = vi.fn(async () => null)
    const target = asset({ id: 'single' })

    await executePendingAssetTrash({ kind: 'trash', asset: target }, trashAssets)
    await executePendingAssetTrash(
      {
        kind: 'bulk-trash',
        assetIds: ['a', 'b'],
        referencedAssetCount: 1,
        unknownReferenceAssetCount: 0,
      },
      trashAssets,
    )

    expect(trashAssets.mock.calls).toEqual([[['single']], [['a', 'b']]])
  })

  it('stays closed when there is no pending action', () => {
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action: null, assets: [] },
      global: { stubs: stubs() },
    })
    expect(wrapper.find('.dialog').exists()).toBe(false)
  })

  it('renders the single-asset action and lists the affected asset', () => {
    const target = asset({
      referenceCertainty: {
        state: 'used',
        proofCurrent: false,
        canonicalGeneration: 1,
        verifiedRunId: null,
        verifiedAt: null,
      },
    })
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action: { kind: 'trash', asset: target }, assets: [target] },
      global: { stubs: stubs() },
    })

    expect(wrapper.find('.dialog').exists()).toBe(true)
    expect(wrapper.find('.title').text()).toBe('ginkoCms.studio.assetBrowser.trashTitle')
    // A referenced asset uses the warning tone.
    expect(wrapper.find('.notice').attributes('data-tone')).toBe('warning')
    expect(wrapper.text()).toContain('hero.jpg')
  })

  it('emits confirm and cancel (update:open=false) from the dialog controls', async () => {
    const target = asset()
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action: { kind: 'trash', asset: target }, assets: [target] },
      global: { stubs: stubs() },
    })

    await wrapper.find('.confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    await wrapper.find('.cancel').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('[AST-07] aggregates the affected assets for a deliberate bulk-trash action', () => {
    const a = asset({ id: 'a', filename: 'a.png' })
    const b = asset({ id: 'b', filename: 'b.png' })
    const wrapper = mount(StudioAssetTrashDialog, {
      props: {
        action: {
          kind: 'bulk-trash',
          assetIds: ['a', 'b'],
          referencedAssetCount: 0,
          unknownReferenceAssetCount: 0,
        },
        assets: [a, b],
      },
      global: { stubs: stubs() },
    })

    expect(wrapper.find('.title').text()).toBe('ginkoCms.studio.assetBrowser.bulkTrashTitle')
    // No referenced assets uses the neutral tone.
    expect(wrapper.find('.notice').attributes('data-tone')).toBe('neutral')
    expect(wrapper.text()).toContain('a.png')
    expect(wrapper.text()).toContain('b.png')
  })
})
