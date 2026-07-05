<script setup lang="ts">
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const EMPTY_PARENT_VALUE = '__ginko_root__'
const editor = useStudioEntryEditorContext()

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
</script>

<template>
  <StudioSection
    title="Publishing details"
    :badge="isRouteBackedEntry ? 'Public page' : 'Data-only'"
  >
    <div class="ginko:space-y-4">
      <div v-if="isRouteBackedEntry && !usesLocalizedSlug" class="ginko:px-0 ginko:py-0">
        <div
          class="ginko:grid ginko:grid-cols-1 ginko:gap-5 ginko:md:grid-cols-2 ginko:xl:grid-cols-4"
        >
          <StudioFieldShell for="slug" label="Public URL">
            <Input
              id="slug"
              v-model="editor.draft.form.slug"
              :disabled="!editor.loader.canEditEntries"
              class="ginko:font-mono ginko:text-sm"
            />
          </StudioFieldShell>
          <StudioFieldShell for="computed-path" :label="editor.loader.t('ginkoCms.common.path')">
            <Input
              id="computed-path"
              :model-value="editor.draft.computedPath"
              disabled
              class="ginko:font-mono ginko:text-sm ginko:text-muted-foreground"
            />
          </StudioFieldShell>
        </div>
        <p class="ginko:mt-1.5 ginko:text-[11px] ginko:leading-5 ginko:text-muted-foreground/70">
          This URL slug is shared by every locale.
        </p>
      </div>

      <div
        v-else
        class="ginko:rounded-lg ginko:border ginko:border-border/50 ginko:bg-background/45 ginko:px-4 ginko:py-3.5"
      >
        <div class="ginko:text-sm ginko:font-medium">
          {{ isRouteBackedEntry ? 'Locale-specific URLs' : 'Shared-content entry' }}
        </div>
        <p class="ginko:mt-1 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
          {{
            isRouteBackedEntry
              ? 'Each locale manages its URL in the locale content section below.'
              : 'This content type does not create website pages. Published website content comes from provider queries after publish.'
          }}
        </p>
      </div>

      <fieldset
        v-if="editor.loader.isTree"
        :disabled="!editor.loader.canEditEntries"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:border-0 ginko:p-0 ginko:md:grid-cols-4"
      >
        <StudioFieldShell
          for="kind"
          :label="editor.loader.t('ginkoCms.studio.collectionEditor.kind')"
        >
          <Select v-model="editor.draft.form.kind" :disabled="!editor.loader.canEditEntries">
            <SelectTrigger class="ginko:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">Page</SelectItem>
              <SelectItem value="folder">Folder</SelectItem>
              <SelectItem value="group">Group</SelectItem>
              <SelectItem value="section">Section</SelectItem>
            </SelectContent>
          </Select>
        </StudioFieldShell>
        <StudioFieldShell
          for="parent"
          :label="editor.loader.t('ginkoCms.studio.collectionEditor.parent')"
        >
          <Select
            :model-value="editor.draft.form.parentEntryId || EMPTY_PARENT_VALUE"
            :disabled="!editor.loader.canEditEntries"
            @update:model-value="
              (value: string) => {
                editor.draft.form.parentEntryId = value === EMPTY_PARENT_VALUE ? '' : String(value)
              }
            "
          >
            <SelectTrigger class="ginko:h-9">
              <SelectValue :placeholder="editor.loader.t('ginkoCms.common.noneRoot')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="EMPTY_PARENT_VALUE">
                {{ editor.loader.t('ginkoCms.common.noneRoot') }}
              </SelectItem>
              <SelectItem
                v-for="parent in editor.loader.parentOptions"
                :key="parent._id"
                :value="parent._id"
                :disabled="parent._id === editor.loader.entryId"
              >
                {{ parent.indent }}{{ parent.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </StudioFieldShell>
        <StudioFieldShell
          for="icon"
          :label="editor.loader.t('ginkoCms.studio.collectionsPage.icon')"
        >
          <Input
            id="icon"
            v-model="editor.draft.form.icon"
            :disabled="!editor.loader.canEditEntries"
            class="ginko:font-mono ginko:text-sm"
            :placeholder="editor.loader.t('ginkoCms.studio.collectionEditor.iconPlaceholder')"
          />
        </StudioFieldShell>
        <StudioFieldShell
          for="badge"
          :label="editor.loader.t('ginkoCms.studio.collectionEditor.badge')"
        >
          <Input
            id="badge"
            v-model="editor.draft.form.badge"
            :disabled="!editor.loader.canEditEntries"
            :placeholder="editor.loader.t('ginkoCms.studio.collectionEditor.badgePlaceholder')"
          />
        </StudioFieldShell>
      </fieldset>

      <fieldset
        v-if="editor.loader.sharedFields.length > 0"
        :disabled="!editor.loader.canEditEntries"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-5 ginko:border-0 ginko:p-0 ginko:md:grid-cols-2 ginko:xl:grid-cols-4"
      >
        <StudioFieldRenderer
          v-for="field in editor.loader.sharedFields"
          :key="field.key"
          :field="field"
          :model-value="editor.draft.dataFields[field.key]"
          :context="editor.draft.editorContext"
          :locale="editor.loader.currentLocale"
          :asset-context="editor.draft.assetContext"
          :disabled="!editor.loader.canEditEntries"
          @update:model-value="editor.draft.dataFields[field.key] = $event"
        />
      </fieldset>
    </div>
  </StudioSection>
</template>
