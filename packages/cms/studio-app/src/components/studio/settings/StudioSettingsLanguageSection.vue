<script setup lang="ts">
import { Globe } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Studio Language ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <Globe class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.studioLanguage') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.studioLanguageDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <Select
        :model-value="settings.currentLocale"
        @update:model-value="settings.setStudioLocale($event)"
      >
        <SelectTrigger class="ginko:w-56 ginko:h-9">
          <SelectValue>
            <span class="ginko:flex ginko:items-center ginko:gap-2">
              <Icon
                :name="
                  settings.studioLocales.find((l) => l.code === settings.currentLocale)?.flag ??
                  'lucide:globe'
                "
                class="ginko:size-4 ginko:shrink-0"
              />
              {{ settings.studioLocales.find((l) => l.code === settings.currentLocale)?.label }}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="locale in settings.studioLocales"
            :key="locale.code"
            :value="locale.code"
            :text-value="locale.label"
          >
            <span class="ginko:flex ginko:items-center ginko:gap-2">
              <Icon :name="locale.flag" class="ginko:size-4 ginko:shrink-0" />
              {{ locale.label }}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </section>
</template>
