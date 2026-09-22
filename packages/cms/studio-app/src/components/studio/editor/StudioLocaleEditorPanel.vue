<script setup lang="ts">
import { Pencil } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import type { StudioEntry } from '../../../composables/internal/types'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'
import { readinessStateTone } from '../../../lib/publicWorkflow'
import StudioEntryHeroFields from './StudioEntryHeroFields.vue'

type EntryMetadata = StudioEntry & {
  updatedAt?: number | string | null
  publishedAt?: number | string | null
}

const props = defineProps<{
  side: 'primary' | 'secondary'
  status?: string
  /** Raw readiness state code — drives the pill tone; `status` is display-only. */
  state?: string | null
  blocked?: boolean
  missingFields?: string[]
}>()

const editor = useStudioEntryEditorContext()
const { studioLocales, t } = useCmsI18n()
const ce = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.collectionEditor.${key}`, params)

const localeCode = computed(() =>
  props.side === 'primary' ? editor.loader.currentLocale : editor.locales.secondaryLocale,
)
const localeCodeLabel = computed(() =>
  contentLanguageLabel(localeCode.value, editor.loader.locales, editor.loader.dateLocale),
)
const isEditingTarget = computed(() => props.side === 'primary' && editor.loader.canEditEntries)
const localeFlag = computed(() => {
  const locale = studioLocales.value.find(
    (item: { code: string; flag?: string }) => item.code === localeCode.value,
  )
  return locale?.flag
})

const isMissing = computed(
  () => props.side === 'secondary' && (props.missingFields?.length ?? 0) > 0,
)
const showStatusPill = computed(
  () => Boolean(props.status) && (props.side === 'secondary' || isMissing.value),
)
const panelTone = computed(() =>
  isMissing.value
    ? 'ginko:border-warning/45 ginko:bg-warning/5 ginko:dark:bg-warning/10'
    : 'ginko:border-border/40 ginko:bg-card',
)

const isRouteBackedEntry = computed(
  () =>
    editor.loader.collectionConfig?.mode !== 'none' &&
    editor.loader.collectionConfig?.routing?.mode !== 'none',
)
const usesLocalizedSlug = computed(() => {
  const mode =
    editor.loader.collectionConfig?.slugMode ??
    editor.loader.collectionConfig?.routing?.slugMode ??
    'shared'
  return mode === 'localized' || mode === 'localizedStable'
})

const entry = computed<EntryMetadata | null>(() => {
  const value = editor.loader.entry as unknown
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: EntryMetadata | null }).value
  }
  return value as EntryMetadata | null
})

const lastUpdatedAt = computed(() => entry.value?.updatedAt ?? entry.value?.publishedAt ?? null)

const primaryLocaleLabel = computed(() =>
  contentLanguageLabel(
    editor.loader.currentLocale,
    editor.loader.locales,
    editor.loader.dateLocale,
  ),
)
const localizedSlugInputId = computed(() => `localized-slug-${props.side}`)
const localizedPathInputId = computed(() => `localized-computed-path-${props.side}`)
const localizedUrlHelp = computed(() =>
  props.side === 'primary'
    ? ce('localePanelSlugOwnership', { locale: localeCodeLabel.value })
    : ce('localePanelUrlManaged', { locale: primaryLocaleLabel.value }),
)

// The hero only renders locale-scoped fields here; shared hero fields render
// once at page level in [id].vue.
const localizedHeroTitleField = computed(() =>
  editor.loader.heroTitleField?.localized ? editor.loader.heroTitleField : null,
)
const localizedHeroDescriptionField = computed(() =>
  editor.loader.heroDescriptionField?.localized ? editor.loader.heroDescriptionField : null,
)

function updateField(fieldKey: string, value: unknown) {
  if (!isEditingTarget.value) return
  editor.draft.dataFields[fieldKey] = value
}
</script>

<template>
  <section
    class="studio-locale-panel ginko:overflow-hidden ginko:rounded-xl ginko:border"
    :class="panelTone"
  >
    <div
      v-if="editor.locales.translationMode"
      class="studio-locale-panel__header ginko:flex ginko:h-12 ginko:items-center ginko:justify-between ginko:gap-3 ginko:border-b ginko:border-border/30 ginko:bg-muted/20 ginko:px-5"
    >
      <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2">
        <span class="ginko:inline-flex ginko:shrink-0 ginko:items-center ginko:gap-1.5">
          <Icon
            v-if="localeFlag"
            :name="localeFlag"
            class="ginko:size-4 ginko:shrink-0"
            aria-hidden="true"
          />
          <span class="studio-text-caption ginko:font-semibold ginko:text-foreground">
            {{ localeCodeLabel }}
          </span>
        </span>
        <StudioStatusPill
          v-if="showStatusPill"
          :label="status"
          :tone="readinessStateTone(state, { blocked: blocked || isMissing })"
          class="ginko:shrink-0"
        />
        <template v-if="lastUpdatedAt">
          <span
            class="studio-locale-panel__meta-separator studio-text-caption ginko:hidden ginko:text-muted-foreground/60 ginko:@5xl:inline"
            aria-hidden="true"
          >
            ·
          </span>
          <span
            class="studio-locale-panel__timestamp studio-text-caption ginko:hidden ginko:truncate ginko:text-muted-foreground ginko:@5xl:inline"
            :title="ce('localePanelLastUpdated')"
          >
            <NuxtTime
              :datetime="lastUpdatedAt"
              :locale="editor.loader.dateLocale"
              month="short"
              day="numeric"
              hour="2-digit"
              minute="2-digit"
            />
          </span>
        </template>
      </div>
      <div class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-1.5">
        <Button
          v-if="side === 'secondary' && editor.loader.canEditEntries"
          variant="outline"
          size="sm"
          :disabled="editor.draft.saving"
          @click="editor.locales.handleSwitchLocale(localeCode)"
        >
          <Pencil class="ginko:size-3.5" />
          <span class="studio-locale-panel__action-full">{{
            ce('localePanelEditLanguage', { locale: localeCodeLabel })
          }}</span>
          <span class="studio-locale-panel__action-short">{{ ce('localePanelEdit') }}</span>
        </Button>
      </div>
    </div>

    <div class="ginko:space-y-5 ginko:bg-card ginko:p-5">
      <StudioNotice v-if="isMissing" tone="warning" :title="ce('localePanelMissingContentTitle')">
        {{
          missingFields?.length === 1
            ? ce('localePanelMissingContentOne', { count: missingFields?.length })
            : ce('localePanelMissingContentOther', { count: missingFields?.length })
        }}
      </StudioNotice>
      <StudioNotice
        v-if="side === 'secondary' && editor.loader.canEditEntries"
        tone="info"
        :title="ce('localePanelReadOnlyTitle', { locale: localeCodeLabel })"
        :description="ce('localePanelReadOnlyDescription')"
      />

      <!-- Writing surface: localized title/description render as the hero
           heading, the URL block moves below the content (metadata-last). -->
      <StudioEntryHeroFields
        v-if="localizedHeroTitleField"
        :title-field="localizedHeroTitleField"
        :description-field="localizedHeroDescriptionField"
        :values="side === 'primary' ? editor.draft.dataFields : editor.locales.secondaryDataFields"
        :disabled="!isEditingTarget"
        :id-prefix="side === 'secondary' ? 'secondary-' : ''"
        show-validation
        @update="updateField"
      />

      <fieldset
        v-if="editor.loader.localizedDetailFields.length > 0"
        :disabled="!isEditingTarget"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-5 ginko:border-0 ginko:p-0 ginko:@3xl:grid-cols-2"
      >
        <StudioFieldRenderer
          v-for="field in editor.loader.localizedDetailFields"
          :key="`${side}-${field.key}`"
          :field="field"
          :model-value="
            side === 'primary'
              ? editor.draft.dataFields[field.key]
              : editor.locales.secondaryDataFields[field.key]
          "
          :context="
            side === 'primary' ? editor.draft.editorContext : editor.locales.secondaryEditorContext
          "
          :locale="localeCode"
          :asset-context="
            side === 'primary' ? editor.draft.assetContext : editor.locales.secondaryAssetContext
          "
          :disabled="!isEditingTarget"
          @update:model-value="updateField(field.key, $event)"
        />
      </fieldset>

      <div
        v-if="isRouteBackedEntry && usesLocalizedSlug"
        class="studio-locale-panel__localized-url ginko:min-h-[9.75rem] ginko:rounded-md ginko:bg-muted/30 ginko:px-3.5 ginko:py-3"
      >
        <div
          class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-[minmax(0,1fr)_16rem]"
        >
          <StudioFieldShell :for="localizedSlugInputId" :label="ce('localePanelLiveUrl')">
            <Input
              v-if="side === 'primary'"
              :id="localizedSlugInputId"
              v-model="editor.draft.form.slug"
              :disabled="!isEditingTarget"
              class="ginko:font-mono ginko:text-sm"
            />
            <Input
              v-else
              :id="localizedSlugInputId"
              :model-value="ce('localePanelManagedIn', { locale: primaryLocaleLabel })"
              disabled
              class="ginko:font-mono ginko:text-sm"
            />
          </StudioFieldShell>
          <StudioFieldShell
            :for="localizedPathInputId"
            :label="editor.loader.t('ginkoCms.common.path')"
          >
            <Input
              :id="localizedPathInputId"
              :model-value="editor.draft.computedPath"
              disabled
              class="ginko:font-mono ginko:text-sm ginko:text-muted-foreground"
            />
          </StudioFieldShell>
        </div>
        <p class="ginko:mt-2 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
          {{ localizedUrlHelp }}
        </p>
      </div>
    </div>
  </section>
</template>
<style scoped>
:deep([data-slot='locale-label']) {
  display: none;
}

.studio-locale-panel__action-short {
  display: none;
}

@media (max-width: 1279px) {
  .studio-locale-panel__action-full {
    display: none;
  }

  .studio-locale-panel__action-short {
    display: inline;
  }
}
</style>
