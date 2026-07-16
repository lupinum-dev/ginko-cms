<script setup lang="ts">
import { Check, Monitor, Moon, Palette, Sun } from '@lucide/vue'
import { computed } from 'vue'

import { useAppearance, type AppearanceColor } from '../../../composables/useAppearance'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useColorMode } from '../../../composables/useColorMode'

// Settings → Appearance, post design-review S3: the theme mode leads (it is
// the preference people actually change), the accent palette is curated down
// from eleven swatches to five calm options, and the Type / Corners pickers
// are gone — they were developer playground, not an editor preference
// (principle 7: defaults over options). Stored type/radius preferences are
// still APPLIED for backward compatibility; a reset row appears only when one
// is active, so nobody is trapped in a mode the UI no longer offers.

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
  orange: 'var(--ginko-color-orange-600)',
  purple: 'var(--ginko-color-purple-600)',
  red: 'var(--ginko-color-red-600)',
  rose: 'var(--ginko-color-rose-600)',
  teal: 'var(--ginko-color-teal-600)',
  yellow: 'var(--ginko-color-yellow-400)',
}

const CURATED_COLORS: AppearanceColor[] = ['default', 'blue', 'green', 'amber', 'violet']

// If a legacy preference points at a non-curated color, keep showing it so
// the active state stays truthful (and switchable away from).
const colorOptions = computed<AppearanceColor[]>(() =>
  CURATED_COLORS.includes(appearance.color.value)
    ? CURATED_COLORS
    : [...CURATED_COLORS, appearance.color.value],
)

const MODES = [
  { value: 'light', icon: Sun, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeLight' },
  { value: 'dark', icon: Moon, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeDark' },
  { value: 'system', icon: Monitor, labelKey: 'ginkoCms.studio.settingsPage.appearanceModeSystem' },
] as const

const hasLegacyTweaks = computed(
  () => appearance.type.value !== 'default' || (appearance.radius.value ?? null) !== null,
)

function resetLegacyTweaks() {
  appearance.setType('default')
  appearance.setRadius(undefined)
}

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

  <!-- Legacy type/radius preferences: no picker anymore, but never trap a
       user in a mode the UI stopped offering. -->
  <section
    v-if="hasLegacyTweaks"
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:text-foreground">
        {{ t('ginkoCms.studio.settingsPage.appearanceLegacyLabel') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.settingsPage.appearanceLegacyDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0">
      <Button variant="outline" size="sm" @click="resetLegacyTweaks">
        {{ t('ginkoCms.studio.settingsPage.appearanceLegacyReset') }}
      </Button>
    </div>
  </section>
</template>
