<script setup lang="ts">
import type { PendingDestructiveAssetAction } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

const props = defineProps<{
  action: PendingDestructiveAssetAction
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const { t } = useCmsI18n()
</script>

<template>
  <StudioConfirmDialog
    :open="!!props.action"
    :title="t('ginkoCms.studio.assetBrowser.trashTitle')"
    :description="t('ginkoCms.studio.assetBrowser.trashDescription')"
    :confirm-label="t('ginkoCms.studio.assetBrowser.moveToTrashConfirm')"
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm')"
  >
    <div class="ginko:space-y-3 ginko:text-sm ginko:text-muted-foreground">
      <p class="ginko:font-medium ginko:text-foreground">
        {{ props.action?.preview.summary }}
      </p>
      <StudioNotice
        v-for="warning in props.action?.preview.warnings ?? []"
        :key="warning.code"
        tone="warning"
        :title="warning.message"
      />
      <div class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3">
        <div
          class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.assetBrowser.affectedAssets') }}
        </div>
        <div class="ginko:space-y-2">
          <div
            v-for="effect in props.action?.preview.effects ?? []"
            :key="`${effect.kind}:${effect.summary}`"
            class="ginko:flex ginko:min-w-0 ginko:items-center ginko:justify-between ginko:gap-3 ginko:text-xs"
          >
            <span class="ginko:truncate ginko:font-medium ginko:text-foreground">
              {{ effect.summary }}
            </span>
            <span class="ginko:shrink-0 ginko:text-muted-foreground">{{ effect.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
