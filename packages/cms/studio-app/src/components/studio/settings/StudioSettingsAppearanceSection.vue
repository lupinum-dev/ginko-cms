<script setup lang="ts">
import { Check, Monitor, Moon, Palette, Sun } from '@lucide/vue'

import { useAppearance, type AppearanceColor } from '../../../composables/useAppearance'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useColorMode } from '../../../composables/useColorMode'

// Theme mode leads and the accent palette contains the complete set of five
// supported choices. Typography, density, and corners remain design-system
// decisions rather than persisted editor preferences.

const { t } = useCmsI18n()
const appearance = useAppearance()
const colorMode = useColorMode()

// Swatch preview colors reference the design-token palette vars (never raw
// hex), so themes.css stays the single source of truth per theme.
const COLOR_SWATCH: Partial<Record<AppearanceColor, string>> = {
  default: 'var(--primary)',
  blue: 'var(--ginko-color-blue-700)',
  green: 'var(--ginko-color-lime-600)',
  amber: 'var(--ginko-color-amber-600)',
  violet: 'var(--ginko-color-violet-600)',
}

const colorOptions: AppearanceColor[] = ['default', 'blue', 'green', 'amber', 'violet']

const MODES = [
  { value: 'light', icon: Sun, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeLight' },
  { value: 'dark', icon: Moon, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeDark' },
  { value: 'system', icon: Monitor, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeSystem' },
] as const

function selectedClass(active: boolean) {
  return active ? 'ginko:!border-primary ginko:border-2 ginko:!bg-primary/10' : ''
}
</script>

<template>
  <!-- ─── Theme (light / dark / system) ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:text-foreground">
        {{ t('ginkoCms.studio.settingsPage.appearanceModeLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceModeDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <div class="ginko:grid ginko:grid-cols-3 ginko:gap-2 ginko:max-w-md">
        <Button
          v-for="mode in MODES"
          :key="mode.value"
          variant="outline"
          size="sm"
          class="ginko:justify-center ginko:gap-2"
          :class="selectedClass(colorMode.preference === mode.value)"
          @click="colorMode.preference = mode.value"
        >
          <component :is="mode.icon" class="ginko:size-4" />
          <span class="ginko:text-xs">{{ t(mode.labelKey) }}</span>
        </Button>
      </div>
    </div>
  </section>

  <!-- ─── Accent color ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground">
        <Palette class="ginko:size-4 ginko:text-muted-foreground" />
        {{ t('ginkoCms.studio.settingsPage.appearanceColorLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceColorDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <div class="ginko:grid ginko:grid-cols-2 ginko:@2xl:grid-cols-3 ginko:gap-2 ginko:max-w-md">
        <Button
          v-for="color in colorOptions"
          :key="color"
          variant="outline"
          size="sm"
          class="ginko:justify-start ginko:gap-2"
          :class="selectedClass(appearance.color.value === color)"
          @click="appearance.setColor(color)"
        >
          <span
            class="ginko:size-5 ginko:flex ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:border-border/60 ginko:shrink-0"
            :style="{ backgroundColor: COLOR_SWATCH[color] ?? 'var(--primary)' }"
          >
            <Check
              v-if="appearance.color.value === color"
              class="ginko:size-3 ginko:text-primary-foreground"
            />
          </span>
          <span class="ginko:text-xs ginko:capitalize ginko:truncate">{{ color }}</span>
        </Button>
      </div>
    </div>
  </section>
</template>
