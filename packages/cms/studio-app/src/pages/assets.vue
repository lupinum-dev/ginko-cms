<script setup lang="ts">
import { Loader2, Upload } from '@lucide/vue'
import { ref, watch } from 'vue'

import StudioAssetDetailsPanel from '../components/studio/StudioAssetDetailsPanel.vue'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useRightSidebar, useRightSidebarPanel } from '../composables/useRightSidebar'
import { provideStudioAssetSelection } from '../composables/useStudioAssetSelection'

const browserRef = ref<{
  uploadInput?: HTMLInputElement | null
  uploading?: boolean
} | null>(null)

const { t } = useCmsI18n()

// Lift the browser's current selection up so the right-sidebar panel — which
// renders in the layout tree, not this page subtree — can read it through the
// props getter (RFC Phase 5 step 5 / D4). The browser publishes into this
// controller via useStudioAssetSelection; the picker context has no provider.
const assetSelection = provideStudioAssetSelection()

useRightSidebarPanel({
  title: () => t('ginkoCms.studio.assetDetails.title'),
  component: StudioAssetDetailsPanel,
  props: () => ({
    assetId: assetSelection.selectedAssetId.value,
    assetContext: assetSelection.assetContext.value,
  }),
  defaultOpen: false,
  compact: true,
})

// A panel whose only content is "no asset selected" should not sit open
// (design review A8): it opens itself when a selection appears, mirroring the
// reviews page.
const rightSidebar = useRightSidebar()
watch(
  () => assetSelection.selectedAssetId.value,
  (assetId, previous) => {
    if (rightSidebar.isMobile.value) return
    if (assetId && !previous) {
      rightSidebar.setOpen(true)
    } else if (!assetId && previous) {
      // Mirror on deselect: an open panel showing "no asset selected" is
      // dead space (empty ≠ visible).
      rightSidebar.setOpen(false)
    }
  },
)
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <!-- No description line: the in-card library nav + breadcrumb already
           say what this page is (design review W7 — triple-labeling diet). -->
      <StudioPageHeader :title="t('ginkoCms.studio.assetsPage.title')">
        <template #actions>
          <Button
            size="sm"
            :disabled="browserRef?.uploading"
            @click="browserRef?.uploadInput?.click()"
          >
            <Loader2
              v-if="browserRef?.uploading"
              class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
            />
            <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
            {{ t('ginkoCms.common.upload') }}
          </Button>
        </template>
      </StudioPageHeader>
    </template>
    <StudioAssetBrowser
      ref="browserRef"
      mode="manage"
      embedded
      class="studio-page-content ginko:h-full"
    />
  </StudioWorkspace>
</template>
