<script setup lang="ts">
import { Copy, GripVertical, MoreHorizontal } from 'lucide-vue-next'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import type { StudioEntry } from '../../../composables/internal/types'
import { useCmsI18n } from '../../../composables/useCmsI18n'

type EntryMetadata = StudioEntry & {
  updatedAt?: number | string | null
  publishedAt?: number | string | null
}

const props = defineProps<{
  side: 'primary' | 'secondary'
  status?: string
  missingFields?: string[]
}>()

const editor = useStudioEntryEditorContext()
const { studioLocales } = useCmsI18n()

const localeCode = computed(() =>
  props.side === 'primary' ? editor.loader.currentLocale : editor.locales.secondaryLocale,
)
const localeCodeLabel = computed(() => localeCode.value.toUpperCase())
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
    ? 'ginko:border-warning/45 ginko:bg-warning/5'
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

const primaryLocaleLabel = computed(() => editor.loader.currentLocale.toUpperCase())

function updateField(fieldKey: string, value: unknown) {
  if (props.side === 'primary') {
    editor.draft.dataFields[fieldKey] = value
  } else {
    editor.locales.secondaryDataFields[fieldKey] = value
  }
}
</script>

<template>
  <section
    class="studio-locale-panel ginko:overflow-hidden ginko:rounded-xl ginko:border"
    :class="panelTone"
  >
    <div
      class="studio-locale-panel__header ginko:flex ginko:h-12 ginko:items-center ginko:justify-between ginko:gap-3 ginko:border-b ginko:border-border/30 ginko:bg-muted/20 ginko:px-5"
    >
      <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2">
        <button
          type="button"
          aria-label="Reorder locale"
          class="ginko:hidden ginko:cursor-grab ginko:items-center ginko:justify-center ginko:rounded ginko:text-muted-foreground/60 ginko:transition-colors ginko:hover:text-foreground ginko:focus-visible:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring/50 ginko:active:cursor-grabbing ginko:sm:inline-flex"
        >
          <GripVertical class="ginko:size-4" />
        </button>
        <span class="ginko:inline-flex ginko:shrink-0 ginko:items-center ginko:gap-1.5">
          <Icon
            v-if="localeFlag"
            :name="localeFlag"
            class="ginko:size-4 ginko:shrink-0"
            aria-hidden="true"
          />
          <span
            class="studio-text-caption ginko:font-mono ginko:font-semibold ginko:uppercase ginko:text-foreground"
          >
            {{ localeCodeLabel }}
          </span>
        </span>
        <Badge
          :variant="side === 'primary' ? 'success' : 'soft'"
          class="studio-locale-panel__role-badge ginko:shrink-0 ginko:rounded-md ginko:text-[10px] ginko:font-semibold"
        >
          {{ side === 'primary' ? 'Source of truth' : 'Translation' }}
        </Badge>
        <StudioStatusPill
          v-if="showStatusPill"
          :label="status"
          :tone="
            status === 'Public' || status === 'Published'
              ? 'success'
              : isMissing
                ? 'warning'
                : 'neutral'
          "
          class="ginko:shrink-0 ginko:capitalize"
        />
        <template v-if="lastUpdatedAt">
          <span
            class="studio-locale-panel__meta-separator studio-text-caption ginko:hidden ginko:text-muted-foreground/60 ginko:lg:inline"
            aria-hidden="true"
          >
            ·
          </span>
          <span
            class="studio-locale-panel__timestamp studio-text-caption ginko:hidden ginko:truncate ginko:text-muted-foreground ginko:lg:inline"
            :title="`Last updated`"
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
          variant="default"
          size="sm"
          :disabled="editor.draft.saving"
          @click="editor.locales.handleSaveSecondaryDraft()"
        >
          <span class="studio-locale-panel__action-full">Save translation draft</span>
          <span class="studio-locale-panel__action-short">Save draft</span>
        </Button>
        <DropdownMenu v-if="side === 'secondary' && editor.loader.canEditEntries">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Translation actions for ${localeCodeLabel}`"
            >
              <MoreHorizontal class="ginko:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="ginko:w-52">
            <DropdownMenuItem
              :disabled="editor.draft.saving"
              @click="editor.copyPrimaryToSecondary()"
            >
              <Copy class="ginko:mr-2 ginko:size-3.5" />
              Copy from {{ primaryLocaleLabel }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="ginko:space-y-5 ginko:bg-card ginko:p-5">
      <div
        v-if="isMissing"
        class="ginko:rounded-md ginko:border ginko:border-warning/40 ginko:bg-warning/10 ginko:px-3.5 ginko:py-3 ginko:text-sm ginko:text-warning-fg"
      >
        <div class="ginko:font-medium">This locale is missing key content.</div>
        <div class="ginko:mt-1 ginko:text-xs">
          {{ missingFields?.length }} field{{ missingFields?.length === 1 ? '' : 's' }} still need
          content.
        </div>
      </div>

      <div
        v-if="side === 'primary' && isRouteBackedEntry && usesLocalizedSlug"
        class="ginko:rounded-md ginko:bg-muted/30 ginko:px-3.5 ginko:py-3"
      >
        <div
          class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:md:grid-cols-[minmax(0,1fr)_16rem]"
        >
          <StudioFieldShell for="localized-slug" label="Public URL">
            <Input
              id="localized-slug"
              v-model="editor.draft.form.slug"
              :disabled="!editor.loader.canEditEntries"
              class="ginko:font-mono ginko:text-sm"
            />
          </StudioFieldShell>
          <StudioFieldShell
            for="localized-computed-path"
            :label="editor.loader.t('ginkoCms.common.path')"
          >
            <Input
              id="localized-computed-path"
              :model-value="editor.draft.computedPath"
              disabled
              class="ginko:font-mono ginko:text-sm ginko:text-muted-foreground"
            />
          </StudioFieldShell>
        </div>
        <p class="ginko:mt-2 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
          This URL slug belongs to {{ localeCodeLabel }} only.
        </p>
      </div>

      <fieldset
        v-if="editor.loader.localizedFields.length > 0"
        :disabled="!editor.loader.canEditEntries"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-5 ginko:border-0 ginko:p-0 ginko:md:grid-cols-2"
      >
        <StudioFieldRenderer
          v-for="field in editor.loader.localizedFields"
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
          :disabled="!editor.loader.canEditEntries"
          @update:model-value="updateField(field.key, $event)"
        />
      </fieldset>
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
<!-- (locale label hidden visually; flag chip + Source/Translation badge cover identification) -->
<!-- Drag handle is visual-only for now; reorder isn't wired up. -->
