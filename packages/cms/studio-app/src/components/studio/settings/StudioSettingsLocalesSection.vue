<script setup lang="ts">
import { Languages } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Languages class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.locales') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.localesDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <StudioNotice
        v-if="settings.settingsQuery.error?.value"
        tone="danger"
        :description="settings.t('ginkoCms.studio.settingsPage.loadError')"
      />

      <StudioEmptyState
        v-else-if="settings.locales.length === 0"
        :title="settings.t('ginkoCms.studio.settingsPage.noLocales')"
      >
        <template #icon>
          <Languages class="ginko:size-5" aria-hidden="true" />
        </template>
      </StudioEmptyState>

      <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          v-for="locale in settings.locales"
          :key="locale.code"
          class="ginko:grid ginko:grid-cols-[5rem_1fr_1fr_auto] ginko:items-center ginko:gap-3 ginko:p-4"
        >
          <code
            class="ginko:rounded ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
          >
            {{ locale.code }}
          </code>
          <span class="ginko:text-sm">{{ locale.label || locale.code }}</span>
          <span class="ginko:text-sm ginko:text-muted-foreground">
            {{ locale.fallback || settings.t('ginkoCms.common.none') }}
          </span>
          <Badge v-if="locale.isDefault" class="ginko:justify-self-end ginko:text-xs">
            {{ settings.t('ginkoCms.common.default') }}
          </Badge>
        </div>
      </div>
    </div>
  </section>
</template>
