<script setup lang="ts">
import { computed } from 'vue'

import type { FinderAssetRecord } from '../../../composables/internal/assetFinderTypes'
import type { PendingDestructiveAssetAction } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Self-contained confirm dialog for trashing one asset or a bulk selection.
// Owns the pending-destructive presentation computeds (title / usage count /
// affected list); the shell only wires the intent + resolves the outcome.
const props = defineProps<{
  action: PendingDestructiveAssetAction
  assets: FinderAssetRecord[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const { t } = useCmsI18n()

const title = computed(() => {
  if (!props.action) return ''
  if (props.action.kind === 'bulk-trash') return t('ginkoCms.studio.assetBrowser.bulkTrashTitle')
  return t('ginkoCms.studio.assetBrowser.trashTitle')
})

const description = computed(() =>
  props.action ? t('ginkoCms.studio.assetBrowser.trashDescription') : '',
)

const confirmLabel = computed(() => t('ginkoCms.studio.assetBrowser.moveToTrashConfirm'))

const usageCount = computed(() => {
  if (!props.action) return 0
  if (props.action.kind === 'bulk-trash') return props.action.usageCount
  return props.action.asset.usages.length
})

const affectedAssets = computed(() => {
  const action = props.action
  if (!action) return []
  if (action.kind === 'bulk-trash') {
    const ids = new Set(action.assetIds)
    return props.assets.filter((asset) => ids.has(asset.id))
  }
  return [action.asset]
})
</script>

<template>
  <StudioConfirmDialog
    :open="!!props.action"
    :title="title"
    :description="description"
    :confirm-label="confirmLabel"
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm')"
  >
    <div class="ginko:space-y-3 ginko:text-sm ginko:text-muted-foreground">
      <StudioNotice
        :tone="usageCount > 0 ? 'warning' : 'neutral'"
        :title="
          usageCount > 0
            ? t(
                usageCount === 1
                  ? 'ginkoCms.studio.assetBrowser.usageAffectedOne'
                  : 'ginkoCms.studio.assetBrowser.usageAffectedOther',
                { count: usageCount },
              )
            : t('ginkoCms.studio.assetBrowser.noUsageFound')
        "
        :description="
          usageCount > 0
            ? t('ginkoCms.studio.assetBrowser.reviewAffected')
            : t('ginkoCms.studio.assetBrowser.noEntriesReference')
        "
      />
      <div class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3">
        <div
          class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.assetBrowser.affectedAssets') }}
        </div>
        <div class="ginko:space-y-2">
          <div
            v-for="asset in affectedAssets.slice(0, 6)"
            :key="asset.id"
            class="ginko:flex ginko:min-w-0 ginko:items-center ginko:justify-between ginko:gap-3 ginko:text-xs"
          >
            <span class="ginko:truncate ginko:font-medium ginko:text-foreground">{{
              asset.filename
            }}</span>
            <span class="ginko:shrink-0 ginko:text-muted-foreground">
              {{
                t(
                  asset.usages.length === 1
                    ? 'ginkoCms.studio.assetBrowser.assetUsageOne'
                    : 'ginkoCms.studio.assetBrowser.assetUsageOther',
                  { count: asset.usages.length },
                )
              }}
            </span>
          </div>
          <div v-if="affectedAssets.length > 6" class="ginko:text-xs ginko:text-muted-foreground">
            {{
              t('ginkoCms.studio.assetBrowser.moreAffected', { count: affectedAssets.length - 6 })
            }}
          </div>
        </div>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
