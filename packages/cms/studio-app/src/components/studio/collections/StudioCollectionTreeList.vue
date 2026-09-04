<script setup lang="ts">
import { GripVertical, Pencil } from '@lucide/vue'

import {
  canEditCollectionEntry,
  collectionKindClasses,
  localeChipClasses,
  localeChipState,
  type DropHint,
  type EnrichedRow,
  type LocaleChipState,
} from '../../../lib/studioCollectionRows'

defineProps<{
  collection: string
  contentRoute: string
  draggingId: string | null
  dropHint: DropHint | null
  hasMultipleLocales: boolean
  localeChipLabels: Record<LocaleChipState, string>
  rows: EnrichedRow[]
}>()

defineEmits<{
  dragEnd: []
  dragOver: [event: DragEvent, row: EnrichedRow]
  dragStart: [id: string]
  drop: [event: DragEvent, row: EnrichedRow]
}>()
</script>

<template>
  <div
    class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
  >
    <div
      v-for="row in rows"
      :key="row._id"
      :draggable="canEditCollectionEntry(row)"
      class="ginko:group ginko:border-b ginko:border-border/60 ginko:px-3 ginko:py-2.5 ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-muted/30"
      :class="[
        draggingId === row._id ? 'ginko:opacity-40' : '',
        dropHint && dropHint.targetId === row._id
          ? dropHint.mode === 'inside'
            ? 'ginko:ring-2 ginko:ring-primary ginko:bg-primary/5'
            : dropHint.mode === 'before'
              ? 'ginko:border-t-2 ginko:border-primary'
              : 'ginko:border-b-2 ginko:border-primary'
          : '',
      ]"
      @dragstart="$emit('dragStart', row._id)"
      @dragend="$emit('dragEnd')"
      @dragover="$emit('dragOver', $event, row)"
      @drop="$emit('drop', $event, row)"
    >
      <div
        class="ginko:flex ginko:items-center ginko:gap-2.5"
        :style="{ paddingLeft: `${row.depth * 20}px` }"
      >
        <button
          type="button"
          class="ginko:cursor-grab ginko:text-muted-foreground/40 ginko:hover:text-muted-foreground ginko:opacity-0 ginko:group-hover:opacity-100 ginko:transition-opacity"
          @mousedown.stop
          @click.stop
        >
          <GripVertical class="ginko:size-3.5" />
        </button>

        <span
          class="ginko:rounded-md ginko:px-1.5 ginko:py-0.5 ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-wide"
          :class="collectionKindClasses[row.kind] ?? collectionKindClasses.page"
        >
          {{ row.kind }}
        </span>

        <div class="ginko:min-w-0 ginko:flex-1">
          <RouterLink
            :to="`${contentRoute}/${collection}/${row._id}`"
            class="ginko:block ginko:rounded-sm ginko:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
          >
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">
              {{ row.title || row.slug }}
            </div>
            <div
              class="ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground/60"
            >
              {{ row.path }}
            </div>
          </RouterLink>
        </div>

        <div
          v-if="hasMultipleLocales"
          class="ginko:hidden ginko:items-center ginko:gap-1 ginko:@3xl:flex"
        >
          <span
            v-for="variant in row.localeVariants"
            :key="variant.locale"
            class="ginko:rounded ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
            :class="localeChipClasses[localeChipState(row, variant)]"
          >
            {{ variant.locale.toUpperCase() }} ·
            {{ localeChipLabels[localeChipState(row, variant)] }}
          </span>
        </div>

        <StudioStatusPill
          :label="row.publicStateLabel"
          :tone="row.publicStateTone"
          class="ginko:hidden ginko:@3xl:inline-flex"
        />

        <div class="ginko:flex ginko:items-center ginko:gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="ginko:size-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-foreground"
            as-child
            @click.stop
          >
            <RouterLink
              :to="`${contentRoute}/${collection}/${row._id}`"
              :aria-label="`Edit ${row.title || row.slug}`"
            >
              <Pencil class="ginko:size-3.5" />
            </RouterLink>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
