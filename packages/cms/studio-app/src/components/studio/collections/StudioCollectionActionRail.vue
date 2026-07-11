<script setup lang="ts">
import { Plus } from '@lucide/vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'

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
  <StudioActionRail
    sheet-description="Collection status, filters, and available actions."
    sheet-title="Collection details"
    title="Details"
  >
    <template #collapsed>
      <div class="studio-action-rail__collapsed-dot">C</div>
      <div class="studio-action-rail__collapsed-dot">Q</div>
      <div class="studio-action-rail__collapsed-dot">F</div>
    </template>

    <template v-if="collectionExists">
      <StudioInspectorSection title="Collection status">
        <template #action>
          <StudioStatusPill :label="collectionType" tone="neutral" class="ginko:capitalize" />
        </template>
        <div class="ginko:space-y-2 ginko:text-sm">
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">Visible content</span>
            <strong>{{ stats.totalVisibleEntries }}</strong>
          </div>
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">Live</span>
            <strong>{{ stats.publicEntryCount }}</strong>
          </div>
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <span class="ginko:text-muted-foreground">Draft only</span>
            <strong>{{ stats.draftOnlyEntryCount }}</strong>
          </div>
        </div>
      </StudioInspectorSection>

      <StudioInspectorSection title="Work queue">
        <div class="ginko:space-y-2 ginko:text-sm">
          <button
            type="button"
            class="ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-left ginko:hover:bg-muted/30"
            @click="emit('setWorkState', 'missing_translation')"
          >
            <span class="ginko:text-muted-foreground">Missing languages</span>
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
            <span class="ginko:text-muted-foreground">Needs attention</span>
            <StudioStatusPill
              :label="String(stats.blockedEntryCount)"
              :tone="stats.blockedEntryCount > 0 ? 'warning' : 'success'"
            />
          </button>
        </div>
      </StudioInspectorSection>

      <StudioInspectorSection title="Current view">
        <div class="ginko:space-y-3 ginko:text-sm">
          <div>
            <div class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
              Filters
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
            Clear filters
          </Button>
        </div>
      </StudioInspectorSection>
    </template>

    <StudioInspectorSection v-else title="No active collection">
      <p class="ginko:text-sm ginko:leading-5 ginko:text-muted-foreground">
        Collection setup is unavailable for this route.
      </p>
    </StudioInspectorSection>

    <template #actions>
      <Button v-if="collectionExists && canCreateEntries && !isSingleton" as-child size="sm">
        <RouterLink :to="newEntryTo">
          <Plus class="ginko:mr-1.5 ginko:size-3.5" />
          {{ t('ginkoCms.studio.collectionListPage.newEntry') }}
        </RouterLink>
      </Button>
      <Button
        v-if="collectionExists"
        variant="outline"
        size="sm"
        @click="emit('setWorkState', 'missing_translation')"
      >
        Review language queue
      </Button>
    </template>
  </StudioActionRail>
</template>
