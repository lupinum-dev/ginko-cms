<script setup lang="ts">
import { Ellipsis, Flag } from '@lucide/vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()

type VersionListItem = {
  _id: string
  action?: string
  createdBy?: string
  displayAction?: string
  publishedLocales?: string[]
  version?: number
}

function localeLabel(code: string) {
  const match = editor.loader.locales?.find((locale: { code: string; label?: string }) => {
    return locale.code === code
  })
  return match?.label ?? code.toUpperCase()
}

function formatVersionAction(version: VersionListItem) {
  if (version.action === 'checkpoint' || version.displayAction === 'checkpoint') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionCheckpoint')
  }
  if (version.action === 'rollback' || version.displayAction === 'restoredPublished') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionRestoredPublished')
  }
  if (version.action === 'archive' || version.displayAction === 'archived') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionArchived')
  }
  if (version.action === 'unpublish' || version.displayAction === 'unpublished') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionUnpublished')
  }
  if (version.action === 'route_rebuild' || version.displayAction === 'routeUpdated') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionRouteUpdated')
  }
  const locales = version.publishedLocales ?? []
  const language = locales.length === 1 ? ` ${localeLabel(locales[0])}` : ''
  return `${editor.loader.t('ginkoCms.studio.collectionEditor.versionPublished')}${language}`
}
</script>

<template>
  <StudioInspectorSection title="Versions">
    <template #action>
      <Button
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:gap-2 ginko:px-2"
        @click="editor.history.showCheckpointDialog = true"
      >
        <Flag class="ginko:size-3.5" />
        {{ editor.loader.t('ginkoCms.studio.collectionEditor.createCheckpoint') }}
      </Button>
    </template>
    <div
      v-if="editor.history.versions.length === 0"
      class="ginko:mt-4 ginko:text-xs ginko:text-muted-foreground"
    >
      No versions yet.
    </div>
    <div
      v-else
      class="ginko:mt-4 ginko:overflow-hidden ginko:rounded-md ginko:border ginko:border-border/40"
    >
      <Item
        v-for="(version, idx) in editor.history.versions.slice(0, 3)"
        :key="version._id"
        size="xs"
        :class="[Number(idx) > 0 && 'ginko:border-t ginko:border-border/30', 'ginko:flex-nowrap']"
      >
        <ItemContent>
          <ItemTitle>
            v{{ version.version }}
            <span v-if="version.isCurrentPublished" class="ginko:ml-1 ginko:text-success-fg">
              Live
            </span>
          </ItemTitle>
          <ItemDescription>
            <span class="ginko:font-medium ginko:text-foreground">
              {{ formatVersionAction(version) }}
            </span>
            <span v-if="version.message"> · {{ version.message }}</span>
            <span> · </span>
            <NuxtTime
              :datetime="version.createdAt"
              :locale="editor.loader.dateLocale"
              month="short"
              day="numeric"
              hour="2-digit"
              minute="2-digit"
            />
          </ItemDescription>
          <StudioDeveloperDetails
            v-if="editor.history.previewVersionId === version._id"
            class="ginko:mt-3"
            :framed="false"
          >
            <dl class="ginko:grid ginko:gap-2 ginko:text-xs">
              <div class="ginko:grid ginko:gap-1">
                <dt class="ginko:font-medium ginko:text-muted-foreground">Revision ID</dt>
                <dd class="ginko:break-all ginko:font-mono">{{ version._id }}</dd>
              </div>
              <div class="ginko:grid ginko:gap-1">
                <dt class="ginko:font-medium ginko:text-muted-foreground">Version number</dt>
                <dd class="ginko:font-mono">{{ version.version }}</dd>
              </div>
              <div v-if="version.createdBy" class="ginko:grid ginko:gap-1">
                <dt class="ginko:font-medium ginko:text-muted-foreground">Created by</dt>
                <dd class="ginko:break-all ginko:font-mono">{{ version.createdBy }}</dd>
              </div>
            </dl>
          </StudioDeveloperDetails>
        </ItemContent>
        <ItemActions>
          <Button
            variant="ghost"
            size="icon"
            class="ginko:size-7"
            :aria-label="`Version ${version.version} details`"
            :aria-expanded="editor.history.previewVersionId === version._id"
            @click="editor.history.toggleVersionPreview(version._id)"
          >
            <Ellipsis aria-hidden="true" class="ginko:size-4" />
          </Button>
        </ItemActions>
      </Item>
    </div>
  </StudioInspectorSection>
</template>
