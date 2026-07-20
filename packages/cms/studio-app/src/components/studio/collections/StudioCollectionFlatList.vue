<script setup lang="ts">
import { useCmsI18n } from '../../../composables/useCmsI18n'
import {
  canEditCollectionEntry,
  localeChipClasses,
  localeChipState,
  type DropHint,
  type EnrichedRow,
  type LocaleChipState,
} from '../../../lib/studioCollectionRows'

const { t } = useCmsI18n()

defineProps<{
  collection: string
  contentRoute: string
  dateLocale: string
  dropHint: DropHint | null
  hasMultipleLocales: boolean
  isTree: boolean
  listGridClass: string
  localeChipLabels: Record<LocaleChipState, string>
  rows: EnrichedRow[]
}>()

defineEmits<{
  dragEnd: []
  dragOver: [event: DragEvent, row: EnrichedRow]
  dragStart: [id: string]
  drop: [event: DragEvent, row: EnrichedRow]
  open: [id: string]
}>()
</script>

<template>
  <div
    class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
  >
    <div
      class="ginko:hidden ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-5 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:@3xl:grid"
      :class="listGridClass"
    >
      <div>{{ t('ginkoCms.studio.collectionListPage.titleColumn') }}</div>
      <div v-if="hasMultipleLocales" class="ginko:hidden ginko:@5xl:block">
        {{ t('ginkoCms.studio.collectionListPage.localesColumn') }}
      </div>
      <div>{{ t('ginkoCms.studio.collectionListPage.statusColumn') }}</div>
      <div class="ginko:text-right">
        {{ t('ginkoCms.studio.collectionListPage.updatedColumn') }}
      </div>
    </div>
    <div
      v-for="row in rows"
      :key="row._id"
      :draggable="!isTree && canEditCollectionEntry(row)"
      data-testid="cms-entry-row"
      :data-entry-slug="row.slug"
      class="studio-collection-row ginko:group ginko:grid ginko:cursor-pointer ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-5 ginko:py-3 ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-muted/30 ginko:@3xl:items-center"
      :class="[listGridClass, dropHint?.targetId === row._id ? 'ginko:bg-primary/5' : '']"
      @click="$emit('open', row._id)"
      @dragstart="$emit('dragStart', row._id)"
      @dragend="$emit('dragEnd')"
      @dragover.prevent="$emit('dragOver', $event, row)"
      @drop.prevent="$emit('drop', $event, row)"
    >
      <div class="ginko:min-w-0 ginko:flex-1">
        <RouterLink
          :to="`${contentRoute}/${collection}/${row._id}`"
          class="ginko:block ginko:rounded-sm ginko:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
        >
          <div class="ginko:truncate ginko:text-sm ginko:font-medium">
            {{ row.title || row.slug }}
          </div>
          <div
            class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground/60"
          >
            {{ row.path || row.slug }}
          </div>
        </RouterLink>
      </div>

      <div
        v-if="hasMultipleLocales"
        class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-1 ginko:@3xl:hidden ginko:@5xl:flex"
      >
        <span
          v-for="variant in row.localeSummaries"
          :key="variant.locale"
          class="ginko:rounded ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
          :class="localeChipClasses[localeChipState(row, variant)]"
        >
          {{ variant.locale.toUpperCase() }} ·
          {{ localeChipLabels[localeChipState(row, variant)] }}
        </span>
      </div>

      <div>
        <StudioStatusPill :label="row.publicStateLabel" :tone="row.publicStateTone" />
      </div>

      <div
        class="ginko:hidden ginko:text-right ginko:text-xs ginko:text-muted-foreground ginko:@3xl:block"
      >
        <NuxtTime :datetime="row.updatedAt" :locale="dateLocale" month="short" day="numeric" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-collection-row {
  content-visibility: auto;
  contain-intrinsic-block-size: 64px;
}
</style>
