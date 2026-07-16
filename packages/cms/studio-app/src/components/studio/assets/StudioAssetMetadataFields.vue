<script setup lang="ts">
import { Loader2 } from '@lucide/vue'

import type { FinderAssetRecord } from '../../../composables/internal/assetFinderTypes'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Language chips + alt/caption inputs + save (and optional copy-to-missing)
// button. Injects the browser context and dedupes the metadata form rendered by
// the pick aside, the mobile details sheet, and the manage drawer. Display
// toggles cover the small per-surface differences (coverage banner, copy
// button, default-locale marker, input sizing).
const props = withDefaults(
  defineProps<{
    asset: FinderAssetRecord
    showCoverage?: boolean
    showCopyButton?: boolean
    showLocaleDefault?: boolean
    showSpinner?: boolean
    disableInputs?: boolean
    inputClass?: string
  }>(),
  {
    showCoverage: false,
    showCopyButton: false,
    showLocaleDefault: false,
    showSpinner: false,
    disableInputs: false,
    inputClass: 'ginko:h-8 ginko:text-xs',
  },
)

const { t } = useCmsI18n()
const { metadata } = useStudioAssetBrowserContext()
</script>

<template>
  <div class="ginko:space-y-2">
    <div
      v-if="props.showCoverage"
      class="ginko:rounded-md ginko:border ginko:px-2.5 ginko:py-2 ginko:text-xs"
      :class="
        metadata.coverage(props.asset).complete
          ? 'ginko:border-success/30 ginko:bg-success/10 ginko:dark:bg-success/15 ginko:text-success-fg'
          : 'ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
      "
    >
      {{ metadata.coverageLabel(props.asset) }}
    </div>
    <div class="ginko:space-y-1.5">
      <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.language') }}</Label>
      <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
        <button
          v-for="locale in metadata.localeOptions.value"
          :key="locale.code"
          type="button"
          class="ginko:inline-flex ginko:h-7 ginko:items-center ginko:gap-1 ginko:rounded-md ginko:px-2 ginko:text-xs ginko:transition-colors"
          :class="
            metadata.activeLocale.value === locale.code
              ? 'ginko:bg-accent ginko:font-medium ginko:text-foreground'
              : 'ginko:text-muted-foreground ginko:hover:bg-muted/60 ginko:hover:text-foreground'
          "
          @click="metadata.activeLocale.value = locale.code"
        >
          <span class="ginko:font-mono ginko:uppercase">{{ locale.code }}</span>
          <span v-if="locale.label !== locale.code" class="ginko:max-w-24 ginko:truncate">{{
            locale.label
          }}</span>
          <span
            v-if="props.showLocaleDefault && locale.isDefault"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            {{ t('ginkoCms.studio.assetBrowser.localeDefault') }}
          </span>
        </button>
      </div>
    </div>
    <div class="ginko:space-y-1.5">
      <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.altText') }}</Label>
      <Input
        v-model="metadata.altText.value"
        :class="props.inputClass"
        :disabled="props.disableInputs && metadata.savingMeta.value"
      />
    </div>
    <div class="ginko:space-y-1.5">
      <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.caption') }}</Label>
      <Input
        v-model="metadata.captionText.value"
        :class="props.inputClass"
        :disabled="props.disableInputs && metadata.savingMeta.value"
      />
    </div>
    <Button
      size="sm"
      variant="outline"
      class="ginko:w-full"
      :disabled="metadata.savingMeta.value"
      @click="metadata.saveMetadata"
    >
      <Loader2
        v-if="props.showSpinner && metadata.savingMeta.value"
        class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
      />
      {{ t('ginkoCms.studio.assetBrowser.saveDetails') }}
    </Button>
    <Button
      v-if="props.showCopyButton && metadata.canCopyDefaultMetadata.value"
      size="sm"
      variant="ghost"
      class="ginko:w-full"
      :disabled="metadata.savingMeta.value"
      @click="metadata.copyDefaultMetadataToMissingLocales"
    >
      {{ t('ginkoCms.studio.assetBrowser.copyDefaultDetails') }}
    </Button>
  </div>
</template>
