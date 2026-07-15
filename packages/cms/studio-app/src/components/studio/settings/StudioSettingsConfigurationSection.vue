<script setup lang="ts">
import { Info } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Configuration (read-only) ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <Info class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.configuration') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.configurationDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm"
        >
          <span class="ginko:text-muted-foreground">{{
            settings.t('ginkoCms.studio.settingsPage.defaultLocale')
          }}</span>
          <code
            class="ginko:font-mono ginko:text-xs ginko:bg-muted ginko:px-2 ginko:py-0.5 ginko:rounded"
            >{{ settings.defaultLocale }}</code
          >
        </div>
        <div
          class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm"
        >
          <span class="ginko:text-muted-foreground">{{
            settings.t('ginkoCms.common.collections')
          }}</span>
          <span class="ginko:text-xs ginko:font-medium">{{
            settings.t('ginkoCms.studio.settingsPage.collectionsConfigured', {
              count: settings.collectionCount,
            })
          }}</span>
        </div>
      </div>

      <StudioDeveloperDetails>
        <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-4 ginko:text-sm">
          <span class="ginko:text-muted-foreground">{{
            settings.t('ginkoCms.studio.settingsPage.studioRoute')
          }}</span>
          <code
            class="ginko:font-mono ginko:text-xs ginko:bg-background ginko:px-2 ginko:py-0.5 ginko:rounded"
            >{{ settings.config.route }}</code
          >
        </div>
      </StudioDeveloperDetails>
    </div>
  </section>
</template>
