<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="field-group"
    :class="
      cn(
        'ginko:group/field-group ginko:@container/field-group ginko:flex ginko:w-full ginko:flex-col ginko:gap-7 ginko:data-[slot=checkbox-group]:gap-3 ginko:[&>[data-slot=field-group]]:gap-4',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
