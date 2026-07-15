<script setup lang="ts">
import { Loader2, Upload } from '@lucide/vue'
import { ref } from 'vue'

import StudioAssetDetailsPanel from '../components/studio/StudioAssetDetailsPanel.vue'
import { useCmsI18n } from '../composables/useCmsI18n'
import { provideStudioAssetSelection } from '../composables/useStudioAssetSelection'
import { useRightSidebarPanel } from '../composables/useRightSidebar'

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
})
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.assetsPage.title')"
        :eyebrow="t('ginkoCms.studio.layout.editor')"
        :description="t('ginkoCms.studio.assetsPage.description')"
      >
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
