<script setup lang="ts">
import { AlertCircle, Settings } from 'lucide-vue-next'
import { proxyRefs } from 'vue'

import StudioSettingsConfigurationSection from '../components/studio/settings/StudioSettingsConfigurationSection.vue'
import StudioSettingsLanguageSection from '../components/studio/settings/StudioSettingsLanguageSection.vue'
import StudioSettingsLocalesSection from '../components/studio/settings/StudioSettingsLocalesSection.vue'
import StudioSettingsMcpConnectionsSection from '../components/studio/settings/StudioSettingsMcpConnectionsSection.vue'
import StudioSettingsMembersSection from '../components/studio/settings/StudioSettingsMembersSection.vue'
import StudioSettingsRevalidationSection from '../components/studio/settings/StudioSettingsRevalidationSection.vue'
import StudioSettingsStorageSection from '../components/studio/settings/StudioSettingsStorageSection.vue'
import { useStudioSettingsAdmin } from '../composables/internal/useStudioSettingsAdmin'

const admin = proxyRefs(useStudioSettingsAdmin())
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader :title="admin.t('ginkoCms.studio.settingsPage.title')" eyebrow="Settings">
        <template #actions>
          <Settings class="ginko:size-4 ginko:text-muted-foreground" />
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-6 ginko:sm:p-8">
        <!-- Global error -->
        <div
          v-if="admin.error"
          class="ginko:mb-6 ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2 ginko:max-w-4xl"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ admin.error }}
        </div>

        <!-- Loading skeleton -->
        <div v-if="admin.isLoading" class="ginko:space-y-8">
          <div
            v-for="i in 3"
            :key="`skeleton-section-${i}`"
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4"
          >
            <div class="ginko:md:w-64 ginko:md:shrink-0 ginko:space-y-2">
              <Skeleton class="ginko:h-4 ginko:w-24" />
              <Skeleton class="ginko:h-3 ginko:w-40" />
            </div>
            <div class="ginko:flex-1 ginko:space-y-3">
              <Skeleton class="ginko:h-10 ginko:w-full ginko:rounded-lg" />
              <Skeleton class="ginko:h-10 ginko:w-full ginko:rounded-lg" />
            </div>
          </div>
        </div>

        <div v-else class="ginko:divide-y">
          <StudioSettingsLanguageSection :admin="admin" />
          <StudioSettingsLocalesSection :admin="admin" />
          <StudioSettingsMembersSection :admin="admin" />
          <StudioSettingsMcpConnectionsSection :admin="admin" />
          <StudioSettingsRevalidationSection :admin="admin" />
          <StudioSettingsStorageSection :admin="admin" />
          <StudioSettingsConfigurationSection :admin="admin" />
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
