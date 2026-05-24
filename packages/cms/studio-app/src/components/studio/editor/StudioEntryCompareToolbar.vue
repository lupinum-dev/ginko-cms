<script setup lang="ts">
import { ArrowLeftRight, Brackets, FileText, Settings } from 'lucide-vue-next'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import { useStudioInspectorVisible } from '../../../composables/useStudioInspectorVisible'

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()
const inspectorVisible = useStudioInspectorVisible()
const { studioLocales } = useCmsI18n()

const canCompare = computed(() => editor.loader.locales.length > 1)
const secondaryLocale = computed(
  () =>
    editor.locales.secondaryLocale ||
    editor.loader.locales.find(
      (locale: { code: string }) => locale.code !== editor.loader.currentLocale,
    )?.code ||
    '',
)
const currentLocaleLabel = computed(() => editor.loader.currentLocale.toUpperCase())
const secondaryLocaleLabel = computed(() => secondaryLocale.value.toUpperCase())

function hasDistinctLocaleLabel(locale: { code: string; label?: string }) {
  return locale.label && locale.label.toLowerCase() !== locale.code.toLowerCase()
}

function localeFlag(code: string) {
  return studioLocales.value.find((locale) => locale.code === code)?.flag
}

function localeFlagName(code: string) {
  return localeFlag(code) ?? ''
}

function toggleMode(compare: boolean) {
  editor.locales.setTranslationMode(compare)
  if (compare && !editor.locales.secondaryLocale && secondaryLocale.value) {
    editor.locales.handleSelectSecondaryLocale(secondaryLocale.value)
  }
  // Compare mode wants the full canvas. Auto-collapse the inspector rail
  // so two locale panels get room; users can re-open via the topbar toggle.
  if (compare && inspectorVisible.value) {
    inspectorVisible.value = false
  }
}

function swapLocales() {
  const right = editor.locales.secondaryLocale
  if (!right || right === editor.loader.currentLocale) return
  const left = editor.loader.currentLocale
  editor.locales.handleSwitchLocale(right)
  editor.locales.handleSelectSecondaryLocale(left)
}
</script>

<template>
  <div
    v-if="canCompare"
    class="studio-entry-compare-toolbar ginko:border-b ginko:border-border/60 ginko:bg-background"
  >
    <div
      class="studio-page-content studio-entry-compare-toolbar__inner ginko:flex ginko:h-10 ginko:items-center ginko:gap-3 ginko:px-5"
    >
      <div
        class="ginko:inline-flex ginko:min-w-0 ginko:rounded-lg ginko:border ginko:border-border/60 ginko:bg-muted/50 ginko:p-0.5"
      >
        <Button
          variant="ghost"
          size="sm"
          class="studio-entry-compare-toolbar__mode-button ginko:h-6 ginko:gap-1.5 ginko:px-2.5"
          :class="
            !editor.locales.translationMode
              ? 'ginko:bg-background ginko:text-foreground ginko:shadow-sm'
              : 'ginko:text-muted-foreground ginko:hover:text-foreground'
          "
          @click="toggleMode(false)"
        >
          <FileText class="ginko:size-3.5" />
          <span class="studio-entry-compare-toolbar__mode-label">Single</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="studio-entry-compare-toolbar__mode-button ginko:h-6 ginko:gap-1.5 ginko:px-2.5"
          :class="
            editor.locales.translationMode
              ? 'ginko:bg-background ginko:text-foreground ginko:shadow-sm'
              : 'ginko:text-muted-foreground ginko:hover:text-foreground'
          "
          @click="toggleMode(true)"
        >
          <Brackets class="ginko:size-3.5" />
          <span class="studio-entry-compare-toolbar__mode-label">Compare</span>
        </Button>
      </div>

      <Separator orientation="vertical" class="ginko:h-4" />

      <template v-if="!editor.locales.translationMode">
        <Select
          :model-value="editor.loader.currentLocale"
          :disabled="editor.draft.saving || !editor.loader.canEditEntries"
          @update:model-value="editor.locales.handleSwitchLocale($event)"
        >
          <SelectTrigger
            class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
          >
            <Icon
              v-if="localeFlag(editor.loader.currentLocale)"
              :name="localeFlagName(editor.loader.currentLocale)"
              class="ginko:size-4 ginko:shrink-0"
              aria-hidden="true"
            />
            <span class="studio-text-caption ginko:font-mono ginko:font-semibold ginko:uppercase">{{
              currentLocaleLabel
            }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="locale in editor.loader.locales"
              :key="locale.code"
              :value="locale.code"
            >
              <Icon
                v-if="localeFlag(locale.code)"
                :name="localeFlagName(locale.code)"
                class="ginko:mr-1 ginko:size-4 ginko:shrink-0"
                aria-hidden="true"
              />
              <span class="studio-text-caption ginko:font-mono ginko:uppercase ginko:text-success">
                {{ locale.code.toUpperCase() }}
              </span>
              <span v-if="hasDistinctLocaleLabel(locale)">{{ locale.label }}</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </template>

      <template v-else>
        <div class="studio-entry-compare-toolbar__locales">
          <Select
            :model-value="editor.loader.currentLocale"
            :disabled="editor.draft.saving || !editor.loader.canEditEntries"
            @update:model-value="editor.locales.handleSwitchLocale($event)"
          >
            <SelectTrigger
              class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
            >
              <Icon
                v-if="localeFlag(editor.loader.currentLocale)"
                :name="localeFlagName(editor.loader.currentLocale)"
                class="ginko:size-4 ginko:shrink-0"
                aria-hidden="true"
              />
              <span
                class="studio-text-caption ginko:font-mono ginko:font-semibold ginko:uppercase"
                >{{ currentLocaleLabel }}</span
              >
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="locale in editor.loader.locales.filter(
                  (item: { code: string }) => item.code !== editor.locales.secondaryLocale,
                )"
                :key="locale.code"
                :value="locale.code"
              >
                <Icon
                  v-if="localeFlag(locale.code)"
                  :name="localeFlagName(locale.code)"
                  class="ginko:mr-1 ginko:size-4 ginko:shrink-0"
                  aria-hidden="true"
                />
                <span
                  class="studio-text-caption ginko:font-mono ginko:uppercase ginko:text-success"
                >
                  {{ locale.code.toUpperCase() }}
                </span>
                <span v-if="hasDistinctLocaleLabel(locale)">{{ locale.label }}</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            class="ginko:shrink-0"
            aria-label="Swap locales"
            @click="swapLocales"
          >
            <ArrowLeftRight class="ginko:size-3.5" />
          </Button>
          <Select
            :model-value="secondaryLocale"
            :disabled="editor.draft.saving || !editor.loader.canEditEntries"
            @update:model-value="editor.locales.handleSelectSecondaryLocale($event ?? '')"
          >
            <SelectTrigger
              class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
            >
              <Icon
                v-if="localeFlag(secondaryLocale)"
                :name="localeFlagName(secondaryLocale)"
                class="ginko:size-4 ginko:shrink-0"
                aria-hidden="true"
              />
              <span
                class="studio-text-caption ginko:font-mono ginko:font-semibold ginko:uppercase"
                >{{ secondaryLocaleLabel }}</span
              >
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="locale in editor.loader.locales.filter(
                  (item: { code: string }) => item.code !== editor.loader.currentLocale,
                )"
                :key="locale.code"
                :value="locale.code"
              >
                <Icon
                  v-if="localeFlag(locale.code)"
                  :name="localeFlagName(locale.code)"
                  class="ginko:mr-1 ginko:size-4 ginko:shrink-0"
                  aria-hidden="true"
                />
                <span
                  class="studio-text-caption ginko:font-mono ginko:uppercase ginko:text-warning-fg"
                >
                  {{ locale.code.toUpperCase() }}
                </span>
                <span v-if="hasDistinctLocaleLabel(locale)">{{ locale.label }}</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <Button v-if="advancedEditor" variant="ghost" size="sm" class="ginko:ml-auto" as-child>
        <RouterLink to="/settings" class="ginko:gap-2">
          <Settings class="ginko:size-3.5" />
          <span class="studio-entry-compare-toolbar__settings-label">Manage locales</span>
        </RouterLink>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.studio-entry-compare-toolbar__locales {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}

.studio-entry-compare-toolbar__locale-trigger {
  min-width: 5rem;
  height: 1.75rem;
  width: auto;
}

@media (max-width: 419px) {
  .studio-entry-compare-toolbar__mode-label,
  .studio-entry-compare-toolbar__settings-label {
    display: none;
  }
}
</style>
