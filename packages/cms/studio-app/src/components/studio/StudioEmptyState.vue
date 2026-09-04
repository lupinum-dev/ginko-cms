<script setup lang="ts">
import { Inbox } from '@lucide/vue'

import { cn } from '../ui/utils'

const props = defineProps<{
  title: string
  description?: string
  class?: string
}>()
</script>

<template>
  <div
    :class="
      cn(
        'studio-reveal ginko:grid ginko:place-items-center ginko:rounded-xl ginko:border ginko:border-dashed ginko:border-border/60 ginko:bg-card/40 ginko:px-6 ginko:py-12 ginko:text-center',
        props.class,
      )
    "
  >
    <div class="ginko:grid ginko:max-w-sm ginko:place-items-center ginko:gap-4">
      <div
        class="ginko:grid ginko:size-10 ginko:place-items-center ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40 ginko:text-muted-foreground"
      >
        <slot name="icon">
          <Inbox class="ginko:size-5" aria-hidden="true" />
        </slot>
      </div>
      <div class="ginko:space-y-1.5">
        <p class="studio-text-title ginko:text-foreground">
          {{ title }}
        </p>
        <p v-if="description" class="studio-text-body ginko:max-w-xs ginko:text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.action" class="ginko:mt-1">
        <slot name="action" />
      </div>
    </div>
  </div>
</template>
