<script setup lang="ts">
import { Inbox } from '@lucide/vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { StudioReviewRequest } from '../../../lib/studioReviewRequests'
import StudioReviewDetail from './StudioReviewDetail.vue'

// Right-sidebar details surface for the /reviews page. Plain props (no
// re-provide): StudioReviewDetail is self-contained and gets its copy from
// useStudioReviewPresentation. Selection is driven by the page and forwarded
// here via the panel's props getter (RFC Phase 5 step 5 / D4).
const props = defineProps<{
  request: StudioReviewRequest | null
}>()

const { t } = useCmsI18n()
</script>

<template>
  <StudioEmptyState
    v-if="!props.request"
    class="ginko:m-4 ginko:border-0 ginko:bg-transparent"
    :title="t('ginkoCms.studio.reviewDetails.emptyTitle')"
    :description="t('ginkoCms.studio.reviewDetails.emptyHint')"
  >
    <template #icon>
      <Inbox class="ginko:size-5" aria-hidden="true" />
    </template>
  </StudioEmptyState>

  <div v-else class="ginko:px-4 ginko:pb-4">
    <StudioReviewDetail :request="props.request" />
  </div>
</template>
