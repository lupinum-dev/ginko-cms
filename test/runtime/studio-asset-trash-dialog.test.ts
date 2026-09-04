// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioAssetTrashDialog from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetTrashDialog.vue'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import {
  createStudioAssetBrowserContext,
  executePendingAssetTrash,
} from '../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext'
import type { PreparedAssetTrash } from '../../packages/cms/studio-app/src/composables/internal/useStudioAssetFinder'

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

function preparedTrash(overrides: Partial<PreparedAssetTrash> = {}): PreparedAssetTrash {
  return {
    kind: 'trash',
    asset: asset(),
    force: false,
    preview: {
      summary: 'Move “hero.jpg” to trash',
      warnings: [{ code: 'ASSET_REFERENCED', message: 'One published entry uses this asset.' }],
      effects: [{ kind: 'asset_trashed', summary: 'Asset moved to trash', count: 1 }],
      confirmation: { token: 'confirmation-token', expiresAt: Date.now() + 60_000 },
    },
    ...overrides,
  }
}

describe('StudioAssetTrashDialog', () => {
  it('does not open the dialog until the authoritative preview resolves', async () => {
    let resolvePreview!: (value: PreparedAssetTrash) => void
    const preview = new Promise<PreparedAssetTrash>((resolve) => {
      resolvePreview = resolve
    })
    const prepareAssetTrash = vi.fn(async () => await preview)
    type ContextOptions = Parameters<typeof createStudioAssetBrowserContext>[0]
    const finder = {
      selectedAsset: ref<FinderAssetRecord | null>(null),
      assets: ref<FinderAssetRecord[]>([]),
      selectedVisibleAssetIds: ref<string[]>([]),
      assetCount: ref(0),
      selectAsset: vi.fn(),
      prepareAssetTrash,
      executeAssetTrash: vi.fn(),
    } as unknown as ContextOptions['finder']
    let context!: ReturnType<typeof createStudioAssetBrowserContext>
    const host = mount(
      defineComponent({
        setup() {
          context = createStudioAssetBrowserContext({
            finder,
            props: { mode: 'manage', aspectRatio: null, modelValue: null },
            emit: vi.fn(),
            t: (key) => key,
            studioSettings: {
              locales: ref([{ code: 'en', label: 'English', isDefault: true }]),
              defaultLocale: ref('en'),
            } as ContextOptions['studioSettings'],
            updateAsset: vi.fn(),
            pendingUploadedAssetId: ref(null),
          })
          return () => null
        },
      }),
    )
    const target = asset()

    const request = context.flow.requestTrashAsset(target)
    expect(prepareAssetTrash).toHaveBeenCalledWith(target)
    expect(context.trash.pendingDestructiveAssetAction.value).toBeNull()

    const prepared = preparedTrash({ asset: target })
    resolvePreview(prepared)
    await request

    expect(context.trash.pendingDestructiveAssetAction.value).toStrictEqual(prepared)
    host.unmount()
  })

  it('executes exactly the already-prepared authoritative operation', async () => {
    const action = preparedTrash()
    const executeAssetTrash = vi.fn(async () => true)

    await expect(executePendingAssetTrash(action, executeAssetTrash)).resolves.toBe(true)

    expect(executeAssetTrash).toHaveBeenCalledOnce()
    expect(executeAssetTrash).toHaveBeenCalledWith(action)
  })

  it('stays closed when there is no pending action', () => {
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action: null },
      global: { stubs: stubs() },
    })
    expect(wrapper.find('.dialog').exists()).toBe(false)
  })

  it('renders the exact backend summary, warnings, and effects', () => {
    const action = preparedTrash()
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action },
      global: { stubs: stubs() },
    })

    expect(wrapper.find('.dialog').exists()).toBe(true)
    expect(wrapper.find('.title').text()).toBe('ginkoCms.studio.assetBrowser.trashTitle')
    expect(wrapper.find('.notice').attributes('data-tone')).toBe('warning')
    expect(wrapper.text()).toContain(action.preview.summary)
    expect(wrapper.text()).toContain(action.preview.warnings[0]?.message)
    expect(wrapper.text()).toContain(action.preview.effects[0]?.summary)
    expect(wrapper.text()).toContain(String(action.preview.effects[0]?.count))
  })

  it('emits confirm and cancel (update:open=false) from the dialog controls', async () => {
    const wrapper = mount(StudioAssetTrashDialog, {
      props: { action: preparedTrash() },
      global: { stubs: stubs() },
    })

    await wrapper.find('.confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    await wrapper.find('.cancel').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
