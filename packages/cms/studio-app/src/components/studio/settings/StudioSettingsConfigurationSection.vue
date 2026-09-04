<script setup lang="ts">
import { Info } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Configuration (read-only) ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground">
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
        <template v-if="settings.contractCompatibility">
          <div
            class="ginko:mt-3 ginko:grid ginko:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] ginko:gap-x-4 ginko:gap-y-2 ginko:border-t ginko:border-border/40 ginko:pt-3 ginko:text-xs"
          >
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractWrites')
            }}</span>
            <strong
              :class="
                settings.contractCompatibility.writable
                  ? 'ginko:text-emerald-600'
                  : 'ginko:text-amber-600'
              "
            >
              {{
                settings.contractCompatibility.writable
                  ? settings.t('ginkoCms.studio.settingsPage.contractReady')
                  : settings.t('ginkoCms.studio.settingsPage.contractBlocked')
              }}
            </strong>
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractTransition')
            }}</span>
            <code class="ginko:font-mono">{{
              settings.contractCompatibility.transitionState ??
              settings.t('ginkoCms.studio.settingsPage.contractNotInstalled')
            }}</code>
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractExpectedContent')
            }}</span>
            <code class="ginko:break-all ginko:font-mono">{{
              settings.contractCompatibility.expectedContentHash
            }}</code>
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractInstalledContent')
            }}</span>
            <code class="ginko:break-all ginko:font-mono">{{
              settings.contractCompatibility.installedContentHash ??
              settings.t('ginkoCms.studio.settingsPage.contractNotInstalled')
            }}</code>
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractExpectedPresentation')
            }}</span>
            <code class="ginko:break-all ginko:font-mono">{{
              settings.contractCompatibility.expectedPresentationHash
            }}</code>
            <span class="ginko:text-muted-foreground">{{
              settings.t('ginkoCms.studio.settingsPage.contractInstalledPresentation')
            }}</span>
            <code class="ginko:break-all ginko:font-mono">{{
              settings.contractCompatibility.installedPresentationHash ??
              settings.t('ginkoCms.studio.settingsPage.contractNotInstalled')
            }}</code>
            <template v-if="settings.contractCompatibility.blockers.length">
              <span class="ginko:text-muted-foreground">{{
                settings.t('ginkoCms.studio.settingsPage.contractDiagnostics')
              }}</span>
              <code class="ginko:font-mono">{{
                settings.contractCompatibility.blockers.join(', ')
              }}</code>
            </template>
          </div>
        </template>
        <p
          v-else
          class="ginko:mt-3 ginko:border-t ginko:border-border/40 ginko:pt-3 ginko:text-xs ginko:text-muted-foreground"
        >
          {{
            settings.contractQuery.error.value?.message ??
            settings.t('ginkoCms.studio.settingsPage.contractStatusLoading')
          }}
        </p>
      </StudioDeveloperDetails>
    </div>
  </section>
</template>
