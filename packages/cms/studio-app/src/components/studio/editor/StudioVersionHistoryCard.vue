<script setup lang="ts">
import { Ellipsis, Flag } from '@lucide/vue'
import { computed, ref } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()
const ce = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.collectionEditor.${key}`, params)

type VersionListItem = {
  _id: string
  action?: string
  createdAt?: number
  createdBy?: string
  createdByLabel?: string | null
  displayAction?: string
  isCurrentPublished?: boolean
  message?: string | null
  publishedLocales?: string[]
  version?: number
}

const DEFAULT_VISIBLE_VERSIONS = 5
const showAllVersions = ref(false)
const visibleVersions = computed<VersionListItem[]>(() =>
  showAllVersions.value
    ? editor.history.versions
    : editor.history.versions.slice(0, DEFAULT_VISIBLE_VERSIONS),
)
const latestVersionId = computed(() => editor.history.versions[0]?._id ?? null)

function localeLabel(code: string) {
  const match = editor.loader.locales?.find((locale: { code: string; label?: string }) => {
    return locale.code === code
  })
  const label = match?.label?.trim()
  // A label that is just the bare locale code reads as a typo ("Published en");
  // fall back to the uppercase code the rest of the UI uses.
  return label && label.toLowerCase() !== code.toLowerCase() ? label : code.toUpperCase()
}

function formatVersionAction(version: VersionListItem) {
  if (version.action === 'checkpoint' || version.displayAction === 'checkpoint') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionCheckpoint')
  }
  if (version.action === 'restore' || version.displayAction === 'restoredDraft') {
    return editor.loader.t('ginkoCms.studio.collectionEditor.versionRestoredDraft')
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
  <StudioInspectorSection :title="ce('versions')">
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
      {{ ce('versionsNoneYet') }}
    </div>
    <div
      v-else
      class="ginko:mt-4 ginko:overflow-hidden ginko:rounded-md ginko:border ginko:border-border/40"
    >
      <Item
        v-for="(version, idx) in visibleVersions"
        :key="version._id"
        size="xs"
        :class="[Number(idx) > 0 && 'ginko:border-t ginko:border-border/30', 'ginko:flex-nowrap']"
      >
        <ItemContent>
          <ItemTitle>
            v{{ version.version }}
            <span v-if="version.isCurrentPublished" class="ginko:ml-1 ginko:text-success-fg">
              {{ ce('versionLive') }}
            </span>
          </ItemTitle>
          <ItemDescription>
            <span class="ginko:font-medium ginko:text-foreground">
              {{ formatVersionAction(version) }}
            </span>
            <span v-if="version.message"> · {{ version.message }}</span>
            <span v-if="version.createdByLabel">
              · {{ ce('versionBy', { name: version.createdByLabel }) }}
            </span>
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
                <dt class="ginko:font-medium ginko:text-muted-foreground">
                  {{ ce('versionRevisionId') }}
                </dt>
                <dd class="ginko:break-all ginko:font-mono">{{ version._id }}</dd>
              </div>
              <div class="ginko:grid ginko:gap-1">
                <dt class="ginko:font-medium ginko:text-muted-foreground">
                  {{ ce('versionNumber') }}
                </dt>
                <dd class="ginko:font-mono">{{ version.version }}</dd>
              </div>
              <div v-if="version.createdBy" class="ginko:grid ginko:gap-1">
                <dt class="ginko:font-medium ginko:text-muted-foreground">
                  {{ ce('versionCreatedBy') }}
                </dt>
                <dd class="ginko:break-all ginko:font-mono">{{ version.createdBy }}</dd>
              </div>
            </dl>
          </StudioDeveloperDetails>
          <StudioVersionDiffList v-if="editor.history.diffLeftVersionId === version._id" />
        </ItemContent>
        <ItemActions>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="ginko:size-7"
                :aria-label="ce('versionActionsAria', { version: version.version })"
              >
                <Ellipsis aria-hidden="true" class="ginko:size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="ginko:w-64">
              <DropdownMenuItem
                v-if="version._id !== latestVersionId"
                @click="editor.history.toggleDiff(version._id)"
              >
                {{
                  editor.history.diffLeftVersionId === version._id
                    ? ce('hideDiff')
                    : ce('compareWithCurrent')
                }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="editor.loader.canEditEntries"
                :disabled="editor.draft.saving"
                @click="editor.history.handleRollback(version._id)"
              >
                {{ editor.loader.t('ginkoCms.common.restoreAsDraft') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="editor.loader.canEditEntries && editor.loader.canPublishEntries"
                :disabled="editor.draft.saving"
                @click="editor.history.handleRollback(version._id, true)"
              >
                {{ editor.loader.t('ginkoCms.common.restoreAndPublish') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator
                v-if="editor.loader.canEditEntries || version._id !== latestVersionId"
              />
              <DropdownMenuItem
                :aria-expanded="editor.history.previewVersionId === version._id"
                @click="editor.history.toggleVersionPreview(version._id)"
              >
                {{ ce('versionDetails') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
    </div>
    <Button
      v-if="editor.history.versions.length > DEFAULT_VISIBLE_VERSIONS"
      variant="ghost"
      size="sm"
      class="ginko:mt-2 ginko:h-7 ginko:w-full ginko:text-xs"
      @click="showAllVersions = !showAllVersions"
    >
      {{
        showAllVersions
          ? ce('versionsShowFewer')
          : ce('versionsShowAll', { count: editor.history.versions.length })
      }}
    </Button>
    <Button
      v-if="editor.history.hasMoreVersions"
      variant="outline"
      size="sm"
      class="ginko:mt-2 ginko:h-8 ginko:w-full ginko:text-xs"
      @click="editor.history.loadMoreVersions()"
    >
      {{ editor.loader.t('ginkoCms.common.loadMore') }}
    </Button>
  </StudioInspectorSection>
</template>
