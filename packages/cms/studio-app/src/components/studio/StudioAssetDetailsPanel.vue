<script setup lang="ts">
import { ImageOff } from '@lucide/vue'

import type { StudioAssetContext } from '../../composables/internal/types'
import { useCmsI18n } from '../../composables/useCmsI18n'
import StudioAssetMetadataForm from './StudioAssetMetadataForm.vue'

// Right-sidebar details surface for the /assets page. Plain props (no re-provide)
// because the shared form is self-contained — it fetches the asset by id and uses
// its own composables (RFC Phase 5 step 5 / D4). Selection is driven by the page
// through useStudioAssetSelection, forwarded here via the panel's props getter.
const props = defineProps<{
  assetId: string | null
  assetContext?: StudioAssetContext
}>()

const { t } = useCmsI18n()
</script>

<template>
  <StudioEmptyState
    v-if="!props.assetId"
    class="ginko:m-4 ginko:border-0 ginko:bg-transparent"
    :title="t('ginkoCms.studio.assetDetails.emptyTitle')"
    :description="t('ginkoCms.studio.assetDetails.emptyHint')"
  >
    <template #icon>
      <ImageOff class="ginko:size-5" aria-hidden="true" />
    </template>
  </StudioEmptyState>

  <StudioAssetMetadataForm v-else :asset-id="props.assetId" :asset-context="props.assetContext" />
</template>
