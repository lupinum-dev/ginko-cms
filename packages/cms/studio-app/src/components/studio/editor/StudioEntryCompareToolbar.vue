<script setup lang="ts">
import { ArrowLeftRight, Brackets, Languages, Settings } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useRightSidebar } from '../../../composables/useRightSidebar'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()
const details = useRightSidebar()
function openLanguageReview() {
  if (details.isMobile.value) details.setOpenMobile(true)
  else details.setOpen(true)
}
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
const currentLocaleLabel = computed(() =>
  contentLanguageLabel(
    editor.loader.currentLocale,
    editor.loader.locales,
    editor.loader.dateLocale,
  ),
)
const secondaryLocaleLabel = computed(() =>
  contentLanguageLabel(secondaryLocale.value, editor.loader.locales, editor.loader.dateLocale),
)

function languageLabel(code: string) {
  return contentLanguageLabel(code, editor.loader.locales, editor.loader.dateLocale)
}

function localeFlag(code: string) {
  return studioLocales.value.find((locale) => locale.code === code)?.flag
}

function localeFlagName(code: string) {
  return localeFlag(code) ?? ''
}

function hasLocaleDraft(code: string) {
  return editor.loader.localeVariants.some(
    (locale: { locale: string; draftExists?: boolean }) =>
      locale.locale === code && locale.draftExists === true,
  )
}

async function toggleMode(compare: boolean) {
  if (!(await editor.locales.setTranslationMode(compare))) return
  if (compare && !editor.locales.secondaryLocale && secondaryLocale.value) {
    await editor.locales.handleSelectSecondaryLocale(secondaryLocale.value)
  }
}

async function swapLocales() {
  const right = editor.locales.secondaryLocale
  if (!right || right === editor.loader.currentLocale) return
  const left = editor.loader.currentLocale
  if (!(await editor.locales.handleSwitchLocale(right))) return
  await editor.locales.handleSelectSecondaryLocale(left)
}
</script>

<template>
  <div
    v-if="canCompare"
    class="studio-entry-compare-toolbar ginko:border-b ginko:border-border/60 ginko:bg-background"
  >
    <div
      class="studio-page-content studio-entry-compare-toolbar__inner ginko:flex ginko:items-center ginko:gap-3 ginko:px-5"
    >
      <template v-if="!editor.locales.translationMode">
        <Select
          :model-value="editor.loader.currentLocale"
          :disabled="editor.draft.saving"
          @update:model-value="editor.locales.handleSwitchLocale($event)"
        >
          <SelectTrigger
            class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
            :aria-label="
              editor.loader.t('ginkoCms.studio.collectionEditor.selectLanguage', {
                language: currentLocaleLabel,
              })
            "
          >
            <Icon
              v-if="localeFlag(editor.loader.currentLocale)"
              :name="localeFlagName(editor.loader.currentLocale)"
              class="ginko:size-4 ginko:shrink-0"
              aria-hidden="true"
            />
            <span class="studio-text-caption ginko:font-semibold">{{ currentLocaleLabel }}</span>
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
              <span class="studio-text-caption ginko:text-success">
                {{ languageLabel(locale.code) }}
              </span>

              <span
                v-if="!editor.loader.pending && !hasLocaleDraft(locale.code)"
                class="ginko:text-muted-foreground"
              >
                {{
                  editor.loader.t(
                    'ginkoCms.studio.collectionEditor.translationReadinessMissingLabel',
                  )
                }}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </template>

      <template v-else>
        <div class="studio-entry-compare-toolbar__locales">
          <Select
            :model-value="editor.loader.currentLocale"
            :disabled="editor.draft.saving"
            @update:model-value="editor.locales.handleSwitchLocale($event)"
          >
            <SelectTrigger
              class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
              :aria-label="
                editor.loader.t('ginkoCms.studio.collectionEditor.selectLanguage', {
                  language: currentLocaleLabel,
                })
              "
            >
              <Icon
                v-if="localeFlag(editor.loader.currentLocale)"
                :name="localeFlagName(editor.loader.currentLocale)"
                class="ginko:size-4 ginko:shrink-0"
                aria-hidden="true"
              />
              <span class="studio-text-caption ginko:font-semibold">{{ currentLocaleLabel }}</span>
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
                <span class="studio-text-caption ginko:text-success">
                  {{ languageLabel(locale.code) }}
                </span>

                <span
                  v-if="!editor.loader.pending && !hasLocaleDraft(locale.code)"
                  class="ginko:text-muted-foreground"
                >
                  {{
                    editor.loader.t(
                      'ginkoCms.studio.collectionEditor.translationReadinessMissingLabel',
                    )
                  }}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            class="ginko:shrink-0"
            :aria-label="editor.loader.t('ginkoCms.studio.collectionEditor.swapLanguages')"
            @click="swapLocales"
          >
            <ArrowLeftRight class="ginko:size-3.5" />
          </Button>
          <Select
            :model-value="secondaryLocale"
            :disabled="editor.draft.saving"
            @update:model-value="editor.locales.handleSelectSecondaryLocale($event ?? '')"
          >
            <SelectTrigger
              class="studio-entry-compare-toolbar__locale-trigger ginko:border-border/60"
              :aria-label="
                editor.loader.t('ginkoCms.studio.collectionEditor.selectComparisonLanguage', {
                  language: secondaryLocaleLabel,
                })
              "
            >
              <Icon
                v-if="localeFlag(secondaryLocale)"
                :name="localeFlagName(secondaryLocale)"
                class="ginko:size-4 ginko:shrink-0"
                aria-hidden="true"
              />
              <span class="studio-text-caption ginko:font-semibold">{{
                secondaryLocaleLabel
              }}</span>
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
                <span class="studio-text-caption ginko:text-warning-fg">
                  {{ languageLabel(locale.code) }}
                </span>

                <span
                  v-if="!editor.loader.pending && !hasLocaleDraft(locale.code)"
                  class="ginko:text-muted-foreground"
                >
                  {{
                    editor.loader.t(
                      'ginkoCms.studio.collectionEditor.translationReadinessMissingLabel',
                    )
                  }}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <div
        class="ginko:inline-flex ginko:min-w-0 ginko:rounded-lg ginko:border ginko:border-border/60 ginko:bg-muted/50 ginko:p-0.5"
      >
        <Button
          variant="ghost"
          size="sm"
          :aria-label="editor.loader.t('ginkoCms.studio.collectionEditor.compareLanguages')"
          class="studio-entry-compare-toolbar__mode-button ginko:h-6 ginko:gap-1.5 ginko:px-2.5"
          :class="
            editor.locales.translationMode
              ? 'ginko:bg-background ginko:text-foreground ginko:shadow-sm'
              : 'ginko:text-muted-foreground ginko:hover:text-foreground'
          "
          :aria-pressed="editor.locales.translationMode"
          @click="toggleMode(!editor.locales.translationMode)"
        >
          <Brackets class="ginko:size-3.5" />
          <span class="studio-entry-compare-toolbar__mode-label">
            {{
              editor.loader.t(
                editor.locales.translationMode
                  ? 'ginkoCms.studio.collectionEditor.finishComparing'
                  : 'ginkoCms.studio.collectionEditor.compareLanguages',
              )
            }}
          </span>
        </Button>
      </div>

      <Button variant="ghost" size="sm" @click="openLanguageReview">
        <Languages class="ginko:size-3.5" />
        {{ editor.loader.t('ginkoCms.studio.translationReview.title') }}
      </Button>

      <Button v-if="advancedEditor" variant="ghost" size="sm" class="ginko:ml-auto" as-child>
        <RouterLink to="/settings" class="ginko:gap-2">
          <Settings class="ginko:size-3.5" />
          <span class="studio-entry-compare-toolbar__settings-label">{{
            editor.loader.t('ginkoCms.studio.collectionEditor.manageLanguages')
          }}</span>
        </RouterLink>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.studio-entry-compare-toolbar__locales {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.studio-entry-compare-toolbar__inner {
  min-height: var(--studio-shell-toolbar-height);
  flex-wrap: wrap;
  padding-block: 0.5rem;
}

.studio-entry-compare-toolbar__locale-trigger {
  min-width: 5rem;
  height: 1.75rem;
  width: auto;
}

@media (max-width: 419px) {
  .studio-entry-compare-toolbar__inner {
    gap: 0.5rem;
    padding-inline: 1rem;
  }
  .studio-entry-compare-toolbar__mode-label,
  .studio-entry-compare-toolbar__settings-label {
    display: none;
  }
}
</style>
