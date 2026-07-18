// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import StudioAssetReplaceDialog from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetReplaceDialog.vue'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import type { PendingAssetReplacement } from '../../packages/cms/studio-app/src/composables/internal/useStudioAssetReplacement'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

const stubs = {
  StudioConfirmDialog: defineComponent({
    props: {
      open: Boolean,
      title: String,
      description: String,
      confirmLabel: String,
      confirmVariant: String,
    },
    emits: ['update:open', 'confirm'],
    template: `<div v-if="open" class="dialog">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <slot />
      <span class="confirm-label">{{ confirmLabel }}</span>
      <button class="confirm" @click="$emit('confirm')">confirm</button>
      <button class="cancel" @click="$emit('update:open', false)">cancel</button>
    </div>`,
  }),
  StudioNotice: {
    props: ['tone', 'title', 'description'],
    template: '<aside class="notice">{{ title }} {{ description }}</aside>',
  },
}

function replacement(): PendingAssetReplacement {
  const asset = {
    id: 'asset_1',
    filename: 'hero-original.png',
    mimeType: 'image/png',
    size: 1024,
    width: 1200,
    height: 630,
    referenceCertainty: {
      state: 'used',
      proofCurrent: true,
      canonicalGeneration: 4,
      verifiedRunId: 'repair-4',
      verifiedAt: 4,
    },
  } as FinderAssetRecord
  return {
    asset,
    sessionId: 'replacement-session',
    replacementFilename: 'hero-updated.png',
    summary: 'Stable asset bytes will be replaced.',
    warnings: [],
    details: {
      stableReference: true,
      metadata: {
        filename: 'hero-original.png',
        alt: { en: 'Hero' },
        caption: { en: 'Lead image' },
        tags: ['campaign'],
        behavior: 'preserved',
      },
      current: {
        mimeType: 'image/png',
        size: 1024,
        sha256: 'a'.repeat(64),
        width: 1200,
        height: 630,
        frames: 1,
      },
      replacement: {
        filename: 'hero-updated.png',
        mimeType: 'image/png',
        size: 2048,
        sha256: 'b'.repeat(64),
        width: 1200,
        height: 630,
        frames: 1,
      },
      usageCounts: { draft: 2, revision: 5, public: 3, publishedEntries: 2 },
      recoveryArtifactId: 'asset_recovery_replacement_1',
      publicFreshness: 'Published asset facts and cache tag update transactionally.',
    },
    confirmation: { token: 'confirm-1', expiresAt: Date.now() + 60_000 },
  }
}

describe('StudioAssetReplaceDialog', () => {
  it('[AST-06] presents the stable-id, impact, metadata, public refresh, and recovery proof', () => {
    const wrapper = mount(StudioAssetReplaceDialog, {
      props: { replacement: replacement(), pending: false },
      global: { stubs },
    })

    expect(wrapper.find('[data-testid="studio-asset-replace-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('hero-original.png')
    expect(wrapper.text()).toContain('hero-updated.png')
    expect(wrapper.text()).toContain('1200 × 630')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.replaceStableReferencesTitle')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.replaceMetadataPreserved')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.replacePublicFreshnessTitle')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetBrowser.replaceRecoveryTitle')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('3')
  })

  it('[AST-06] confirms once and cannot dismiss or reconfirm while execution is pending', async () => {
    const wrapper = mount(StudioAssetReplaceDialog, {
      props: { replacement: replacement(), pending: false },
      global: { stubs },
    })

    await wrapper.find('.confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[]])

    await wrapper.setProps({ pending: true })
    expect(wrapper.find('.confirm-label').text()).toBe(
      'ginkoCms.studio.assetBrowser.replaceInProgress',
    )
    await wrapper.find('.confirm').trigger('click')
    await wrapper.find('.cancel').trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[]])
    expect(wrapper.emitted('update:open')).toBeUndefined()

    await wrapper.setProps({ pending: false })
    await wrapper.find('.cancel').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
