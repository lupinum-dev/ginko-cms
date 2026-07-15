<script setup lang="ts">
import { Plus } from '@lucide/vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'

// Right-sidebar detail panel for the collection list (Phase L). Successor of
// the retired StudioCollectionActionRail: same inspector content, but hosted
// by the shell's right-sidebar system (title/description render in the panel
// header, so this component is body-only). Registered from
// pages/[collection]/index.vue via useRightSidebarPanel with a reactive props
// getter; callbacks arrive as onClearFilters/onSetWorkState listener props.

type CollectionRailStats = {
  totalVisibleEntries: number
  publicEntryCount: number
  draftOnlyEntryCount: number
  blockedEntryCount: number
  missingTranslationEntryCount: number
}

defineProps<{
  activeFilterLabel: string
  canCreateEntries: boolean
  collectionExists: boolean
  collectionType: string
  hasActiveFilters: boolean
  isSingleton: boolean
  newEntryTo: string
  stats: CollectionRailStats
}>()

const emit = defineEmits<{
  clearFilters: []
  setWorkState: [state: 'missing_translation' | 'blocked']
}>()

const { t } = useCmsI18n()
</script>

<template>
  <div class="ginko:flex ginko:flex-col ginko:gap-6">
    <template v-if="collectionExists">
      <div class="ginko:flex ginko:flex-col ginko:gap-2">
        <Button v-if="canCreateEntries && !isSingleton" as-child size="sm">
          <RouterLink :to="newEntryTo">
            <Plus class="ginko:mr-1.5 ginko:size-3.5" />
            {{ t('ginkoCms.studio.collectionListPage.newEntry') }}
          </RouterLink>
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="emit('setWorkState', 'missing_translation')"
        >
          {{ t('ginkoCms.studio.collectionListPage.reviewLanguageQueue') }}
        </Button>
      </div>

      <StudioInspectorSection :title="t('ginkoCms.studio.collectionListPage.collectionStatus')">
        <template #action>
          <StudioStatusPill :label="collectionType" tone="neutral" class="ginko:capitalize" />
        </template>
        <div class="ginko:space-y-2 ginko:text-sm">
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionListPage.visibleContent')
            }}</span>
            <strong>{{ stats.totalVisibleEntries }}</strong>
          </div>
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionListPage.liveCount')
            }}</span>
            <strong>{{ stats.publicEntryCount }}</strong>
          </div>
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionListPage.draftOnly')
            }}</span>
            <strong>{{ stats.draftOnlyEntryCount }}</strong>
          </div>
        </div>
      </StudioInspectorSection>

      <StudioInspectorSection :title="t('ginkoCms.studio.collectionListPage.workQueue')">
        <div class="ginko:space-y-2 ginko:text-sm">
          <button
            type="button"
            class="ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-left ginko:hover:bg-muted/30"
            @click="emit('setWorkState', 'missing_translation')"
          >
            <span class="ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionListPage.missingLanguages')
            }}</span>
            <StudioStatusPill
              :label="String(stats.missingTranslationEntryCount)"
              :tone="stats.missingTranslationEntryCount > 0 ? 'warning' : 'success'"
            />
          </button>
          <button
            type="button"
            class="ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-left ginko:hover:bg-muted/30"
            @click="emit('setWorkState', 'blocked')"
          >
            <span class="ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionListPage.needsAttention')
            }}</span>
            <StudioStatusPill
              :label="String(stats.blockedEntryCount)"
              :tone="stats.blockedEntryCount > 0 ? 'warning' : 'success'"
            />
          </button>
        </div>
      </StudioInspectorSection>

      <StudioInspectorSection :title="t('ginkoCms.studio.collectionListPage.currentView')">
        <div class="ginko:space-y-3 ginko:text-sm">
          <div>
            <div class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.collectionListPage.filters') }}
            </div>
            <div class="ginko:font-medium">{{ activeFilterLabel }}</div>
          </div>
          <Button
            v-if="hasActiveFilters"
            variant="outline"
            size="sm"
            class="ginko:w-full"
            @click="emit('clearFilters')"
          >
            {{ t('ginkoCms.studio.collectionListPage.clearFilters') }}
          </Button>
        </div>
      </StudioInspectorSection>
    </template>

    <StudioInspectorSection
      v-else
      :title="t('ginkoCms.studio.collectionListPage.noActiveCollection')"
    >
      <p class="ginko:text-sm ginko:leading-5 ginko:text-muted-foreground">
        {{ t('ginkoCms.studio.collectionListPage.noActiveCollectionDescription') }}
      </p>
    </StudioInspectorSection>
  </div>
</template>
