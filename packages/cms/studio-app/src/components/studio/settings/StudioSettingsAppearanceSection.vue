<script setup lang="ts">
import { Check, Monitor, Moon, Palette, Sun, Type } from '@lucide/vue'

import {
  useAppearance,
  type AppearanceColor,
  type AppearanceRadius,
  type AppearanceType,
} from '../../../composables/useAppearance'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useColorMode } from '../../../composables/useColorMode'

// Settings → Appearance (RFC D7). Drives the shared useAppearance store (the
// same one Layout.vue binds onto the .ginko-cms root) plus useColorMode for the
// light/dark/system preference. Ships ungated: there is no cmsConfig UI-flags
// mechanism today (only feature-specific flags like `sidebar.dark` /
// `mcp.enabled`), so per RFC open-question 4 this is on for everyone.

const { t } = useCmsI18n()
const appearance = useAppearance()
const colorMode = useColorMode()

// Swatch preview colors reference the design-token palette vars (never raw hex),
// so themes.css stays the single source of truth for each theme's primary.
const COLOR_SWATCH: Record<AppearanceColor, string> = {
  default: 'var(--primary)',
  blue: 'var(--ginko-color-blue-700)',
  amber: 'var(--ginko-color-amber-600)',
  green: 'var(--ginko-color-lime-600)',
  orange: 'var(--ginko-color-orange-600)',
  purple: 'var(--ginko-color-purple-600)',
  red: 'var(--ginko-color-red-600)',
  rose: 'var(--ginko-color-rose-600)',
  teal: 'var(--ginko-color-teal-600)',
  violet: 'var(--ginko-color-violet-600)',
  yellow: 'var(--ginko-color-yellow-400)',
}

const MODES = [
  { value: 'light', icon: Sun, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeLight' },
  { value: 'dark', icon: Moon, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeDark' },
  { value: 'system', icon: Monitor, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeSystem' },
] as const

// null = the "Default" pill (radius unset → --radius token default).
const RADIUS_OPTIONS: Array<AppearanceRadius | null> = [
  null,
  'none',
  'small',
  'medium',
  'large',
  'full',
]

function selectedClass(active: boolean) {
  return active ? 'ginko:!border-primary ginko:border-2 ginko:!bg-primary/10' : ''
}
</script>

<template>
  <!-- ─── Accent color ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Palette class="ginko:size-4 ginko:text-muted-foreground" />
        {{ t('ginkoCms.studio.settingsPage.appearanceColorLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceColorDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <div class="ginko:grid ginko:grid-cols-2 ginko:sm:grid-cols-3 ginko:gap-2 ginko:max-w-md">
        <Button
          v-for="color in appearance.COLORS"
          :key="color"
          variant="outline"
          size="sm"
          class="ginko:justify-start ginko:gap-2"
          :class="selectedClass(appearance.color.value === color)"
          @click="appearance.setColor(color)"
        >
          <span
            class="ginko:size-5 ginko:flex ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:border-border/60 ginko:shrink-0"
            :style="{ backgroundColor: COLOR_SWATCH[color] }"
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

  <!-- ─── Type ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Type class="ginko:size-4 ginko:text-muted-foreground" />
        {{ t('ginkoCms.studio.settingsPage.appearanceTypeLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceTypeDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <div class="ginko:grid ginko:grid-cols-3 ginko:gap-2 ginko:max-w-md">
        <Button
          v-for="variant in appearance.TYPES"
          :key="variant"
          variant="outline"
          size="sm"
          class="ginko:justify-center"
          :class="selectedClass(appearance.type.value === variant)"
          @click="appearance.setType(variant as AppearanceType)"
        >
          <span class="ginko:text-xs ginko:capitalize">{{ variant }}</span>
        </Button>
      </div>
    </div>
  </section>

  <!-- ─── Corners (radius) ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2 class="ginko:text-sm ginko:font-medium ginko:text-foreground">
        {{ t('ginkoCms.studio.settingsPage.appearanceRadiusLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceRadiusDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <div class="ginko:flex ginko:flex-wrap ginko:gap-2 ginko:max-w-md">
        <Button
          v-for="option in RADIUS_OPTIONS"
          :key="option ?? 'default'"
          variant="outline"
          size="sm"
          class="ginko:justify-center"
          :class="selectedClass((appearance.radius.value ?? null) === option)"
          @click="appearance.setRadius(option ?? undefined)"
        >
          <span class="ginko:text-xs ginko:capitalize">
            {{ option ?? t('ginkoCms.studio.settingsPage.appearanceRadiusDefault') }}
          </span>
        </Button>
      </div>
    </div>
  </section>

  <!-- ─── Theme (light / dark / system) ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2 class="ginko:text-sm ginko:font-medium ginko:text-foreground">
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
</template>
