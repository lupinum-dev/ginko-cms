<script setup lang="ts">
import { computed } from 'vue'

import { formatFileSize } from '../../../composables/internal/assetFinderUtils'
import type { PendingAssetReplacement } from '../../../composables/internal/useStudioAssetReplacement'
import { useCmsI18n } from '../../../composables/useCmsI18n'

const props = defineProps<{
  replacement: PendingAssetReplacement | null
  pending: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const { t } = useCmsI18n()

const title = computed(() => t('ginkoCms.studio.assetBrowser.replaceTitle'))
const confirmLabel = computed(() =>
  props.pending
    ? t('ginkoCms.studio.assetBrowser.replaceInProgress')
    : t('ginkoCms.studio.assetBrowser.replaceConfirm'),
)

function updateOpen(open: boolean) {
  if (!props.pending) emit('update:open', open)
}

function confirm() {
  if (!props.pending) emit('confirm')
}
</script>

<template>
  <StudioConfirmDialog
    :open="!!props.replacement"
    :title="title"
    :description="t('ginkoCms.studio.assetBrowser.replaceDescription')"
    :confirm-label="confirmLabel"
    confirm-variant="default"
    @update:open="updateOpen"
    @confirm="confirm"
  >
    <div
      v-if="props.replacement"
      data-testid="studio-asset-replace-preview"
      class="ginko:space-y-4 ginko:text-sm"
      :aria-busy="props.pending"
    >
      <StudioNotice
        tone="neutral"
        :title="t('ginkoCms.studio.assetBrowser.replaceStableReferencesTitle')"
        :description="t('ginkoCms.studio.assetBrowser.replaceStableReferencesDescription')"
      />

      <div
        class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] ginko:items-center ginko:gap-3"
      >
        <div class="ginko:min-w-0">
          <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ t('ginkoCms.studio.assetBrowser.replaceCurrentFile') }}
          </div>
          <div class="ginko:truncate ginko:font-medium">
            {{ props.replacement.details.metadata.filename }}
          </div>
          <div class="ginko:text-xs ginko:text-muted-foreground">
            {{ props.replacement.details.current.width }} ×
            {{ props.replacement.details.current.height }} ·
            {{ formatFileSize(props.replacement.details.current.size) }}
          </div>
        </div>
        <span aria-hidden="true" class="ginko:text-muted-foreground">→</span>
        <div class="ginko:min-w-0 ginko:text-right">
          <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ t('ginkoCms.studio.assetBrowser.replaceNewFile') }}
          </div>
          <div class="ginko:truncate ginko:font-medium">
            {{ props.replacement.details.replacement.filename }}
          </div>
          <div class="ginko:text-xs ginko:text-muted-foreground">
            {{ props.replacement.details.replacement.width }} ×
            {{ props.replacement.details.replacement.height }} ·
            {{ formatFileSize(props.replacement.details.replacement.size) }}
          </div>
        </div>
      </div>

      <div class="ginko:border-y ginko:border-border/60 ginko:py-3">
        <div
          class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.assetBrowser.replaceUsageTitle') }}
        </div>
        <dl class="ginko:grid ginko:grid-cols-3 ginko:gap-3">
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.assetBrowser.replaceDraftUses') }}
            </dt>
            <dd class="ginko:font-medium ginko:tabular-nums">
              {{ props.replacement.details.usageCounts.draft }}
            </dd>
          </div>
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.assetBrowser.replaceRevisionUses') }}
            </dt>
            <dd class="ginko:font-medium ginko:tabular-nums">
              {{ props.replacement.details.usageCounts.revision }}
            </dd>
          </div>
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.assetBrowser.replacePublishedUses') }}
            </dt>
            <dd class="ginko:font-medium ginko:tabular-nums">
              {{ props.replacement.details.usageCounts.public }}
            </dd>
          </div>
        </dl>
      </div>

      <div class="ginko:space-y-2 ginko:text-xs ginko:text-muted-foreground">
        <p>
          <span class="ginko:font-medium ginko:text-foreground">
            {{ t('ginkoCms.studio.assetBrowser.replaceMetadataPreserved') }}
          </span>
          {{ t('ginkoCms.studio.assetBrowser.replaceMetadataPreservedDescription') }}
        </p>
        <p v-if="props.replacement.details.usageCounts.public > 0">
          <span class="ginko:font-medium ginko:text-foreground">
            {{ t('ginkoCms.studio.assetBrowser.replacePublicFreshnessTitle') }}
          </span>
          {{ t('ginkoCms.studio.assetBrowser.replacePublicFreshnessDescription') }}
        </p>
        <p>
          <span class="ginko:font-medium ginko:text-foreground">
            {{ t('ginkoCms.studio.assetBrowser.replaceRecoveryTitle') }}
          </span>
          {{ t('ginkoCms.studio.assetBrowser.replaceRecoveryDescription') }}
        </p>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
