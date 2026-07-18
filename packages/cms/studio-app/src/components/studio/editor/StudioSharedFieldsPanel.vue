<script setup lang="ts">
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()
// "Shared / applies to all languages" is schema vocabulary that only earns
// its place when there are several languages (design review S2, principle 6).
const hasMultipleLocales = computed(() => (editor.loader.locales?.length ?? 1) > 1)
// Metadata-last (writing surface): this panel renders below the content and
// disappears entirely when the hero absorbed every shared field and there is
// no tree placement to manage.
const hasContent = computed(
  () => editor.loader.isTree || editor.loader.sharedDetailFields.length > 0,
)
</script>

<template>
  <StudioSection
    v-if="hasContent"
    :title="
      hasMultipleLocales
        ? editor.loader.t('ginkoCms.studio.collectionEditor.sharedFields')
        : editor.loader.t('ginkoCms.common.metadata')
    "
    :badge="
      hasMultipleLocales
        ? editor.loader.t('ginkoCms.studio.collectionEditor.appliesToAllLanguages')
        : undefined
    "
  >
    <div class="ginko:space-y-4">
      <fieldset
        v-if="editor.loader.isTree"
        :disabled="!editor.loader.canEditEntries"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:border-0 ginko:p-0 ginko:@3xl:grid-cols-4"
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
          <StudioEntryParentPicker
            :model-value="editor.draft.form.parentEntryId"
            :collection="editor.loader.collection"
            :locale="editor.loader.defaultLocale"
            :exclude-entry-id="editor.loader.entryId"
            :disabled="!editor.loader.canEditEntries"
            @update:model-value="
              (value: string) => (editor.draft.form.parentEntryId = String(value))
            "
            @select="editor.loader.recordParentSelection"
          />
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
        v-if="editor.loader.sharedDetailFields.length > 0"
        :disabled="!editor.loader.canEditEntries"
        class="ginko:m-0 ginko:grid ginko:grid-cols-1 ginko:gap-5 ginko:border-0 ginko:p-0 ginko:@3xl:grid-cols-2 ginko:@5xl:grid-cols-4"
      >
        <StudioFieldRenderer
          v-for="field in editor.loader.sharedDetailFields"
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
