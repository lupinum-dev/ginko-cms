<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Link, Loader2 } from '@lucide/vue'

import type { FinderAssetRecord } from '../../../composables/internal/assetFinderTypes'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { humanizeFieldPath } from '../../../lib/fieldLabel'

defineProps<{ asset: FinderAssetRecord }>()

const { t } = useCmsI18n()
const { finder } = useStudioAssetBrowserContext()

function sourceLabel(sourceKind: 'draft' | 'revision' | 'public') {
  if (sourceKind === 'draft') return t('ginkoCms.studio.assetBrowser.referenceSourceDraft')
  if (sourceKind === 'revision') return t('ginkoCms.studio.assetBrowser.referenceSourceRevision')
  return t('ginkoCms.studio.assetBrowser.referenceSourcePublic')
}
</script>

<template>
  <div class="ginko:space-y-2">
    <h4 class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60">
      {{ t('ginkoCms.studio.assetBrowser.usage') }}
    </h4>
    <div
      v-if="asset.referenceCertainty.state === 'unused-verified'"
      class="ginko:flex ginko:items-start ginko:gap-1.5 ginko:text-xs ginko:text-muted-foreground"
    >
      <CheckCircle2 class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0" />
      {{ t('ginkoCms.studio.assetBrowser.unusedVerified') }}
    </div>
    <div
      v-else-if="asset.referenceCertainty.state === 'unknown-stale'"
      class="ginko:flex ginko:items-start ginko:gap-1.5 ginko:text-xs ginko:text-warning-fg"
    >
      <AlertTriangle class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0" />
      {{ t('ginkoCms.studio.assetBrowser.usageUnknownStaleHelp') }}
    </div>
    <div
      v-else-if="finder.selectedAssetUsagesLoading.value"
      class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-muted-foreground"
    >
      <Loader2 class="ginko:size-3.5 ginko:animate-spin" />
      {{ t('ginkoCms.studio.assetBrowser.loadingReferences') }}
    </div>
    <template v-else>
      <RouterLink
        v-for="usage in finder.selectedAssetUsages.value"
        :key="`${usage.sourceKind}:${usage.sourceId}:${usage.fieldPath}:${usage.locale}`"
        :to="`/content/${usage.collection}/${usage.entryId}`"
        class="ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-sm ginko:border-b ginko:border-border/30 ginko:py-1.5 ginko:text-xs ginko:last:border-0 ginko:hover:bg-muted/40 ginko:focus-visible:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
      >
        <Link class="ginko:mt-0.5 ginko:size-3 ginko:shrink-0 ginko:text-muted-foreground/50" />
        <div class="ginko:min-w-0">
          <div class="ginko:truncate ginko:font-medium">{{ usage.entryTitle }}</div>
          <div class="ginko:text-xs ginko:text-muted-foreground/50">
            {{ humanizeFieldPath(usage.fieldPath) }} · {{ usage.locale.toUpperCase() }} ·
            {{ sourceLabel(usage.sourceKind) }}
          </div>
        </div>
      </RouterLink>
      <p
        v-if="finder.selectedAssetUsages.value.length === 0"
        class="ginko:text-xs ginko:text-muted-foreground"
      >
        {{ t('ginkoCms.studio.assetBrowser.assetReferenced') }}
      </p>
      <Button
        v-if="finder.hasMoreSelectedAssetUsages.value"
        variant="outline"
        size="sm"
        class="ginko:w-full ginko:text-xs"
        :disabled="finder.selectedAssetUsagesLoadingMore.value"
        @click="finder.loadMoreSelectedAssetUsages"
      >
        <Loader2
          v-if="finder.selectedAssetUsagesLoadingMore.value"
          class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin"
        />
        {{ t('ginkoCms.studio.assetBrowser.loadMoreReferences') }}
      </Button>
    </template>
  </div>
</template>
