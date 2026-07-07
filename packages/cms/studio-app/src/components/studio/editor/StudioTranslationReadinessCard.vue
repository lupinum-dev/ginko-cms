<script setup lang="ts">
import { computed } from 'vue'

import type { StudioTranslationReadinessRow } from './studioWorkflowTypes'

const props = defineProps<{
  items: StudioTranslationReadinessRow[]
}>()

const emit = defineEmits<{
  review: [locale: string]
}>()

const primaryItem = computed(() => props.items[0] ?? null)
const filledCount = computed(() => {
  if (!primaryItem.value) return 0
  return Math.max(0, 6 - primaryItem.value.missingFields.length)
})
const totalCount = computed(() => Math.max(6, primaryItem.value?.missingFields.length ?? 0))
const percent = computed(() =>
  totalCount.value > 0 ? Math.round((filledCount.value / totalCount.value) * 100) : 100,
)
</script>

<template>
  <StudioInspectorSection v-if="primaryItem" title="Language status">
    <div class="ginko:flex ginko:items-center ginko:gap-4">
      <div
        class="ginko:grid ginko:size-14 ginko:place-items-center ginko:rounded-full ginko:border-4 ginko:border-muted ginko:text-sm ginko:font-semibold"
      >
        {{ percent }}%
      </div>
      <div class="ginko:min-w-0">
        <div class="ginko:font-medium">{{ primaryItem.label }}</div>
        <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
          {{ filledCount }} of {{ totalCount }} fields filled
        </div>
        <Badge
          variant="outline"
          class="ginko:mt-2"
          :class="
            primaryItem.missingFields.length
              ? 'ginko:border-warning/40 ginko:text-warning-fg'
              : 'ginko:border-success/40 ginko:text-success-fg'
          "
        >
          {{ primaryItem.missingFields.length ? 'Needs work' : 'Ready' }}
        </Badge>
      </div>
    </div>
    <Button
      variant="ghost"
      size="sm"
      class="ginko:mt-4 ginko:w-full ginko:justify-between"
      @click="emit('review', primaryItem.locale)"
    >
      Review language
      <span>›</span>
    </Button>
  </StudioInspectorSection>
</template>
