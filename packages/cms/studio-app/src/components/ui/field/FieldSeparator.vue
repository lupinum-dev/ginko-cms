<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Separator } from '../separator'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="field-separator"
    :data-content="!!$slots.default"
    :class="
      cn(
        'ginko:relative ginko:-my-2 ginko:h-5 ginko:text-sm ginko:group-data-[variant=outline]/field-group:-mb-2',
        props.class,
      )
    "
  >
    <Separator class="ginko:absolute ginko:inset-0 ginko:top-1/2" />
    <span
      v-if="$slots.default"
      class="ginko:bg-background ginko:text-muted-foreground ginko:relative ginko:mx-auto ginko:block ginko:w-fit ginko:px-2"
      data-slot="field-separator-content"
    >
      <slot />
    </span>
  </div>
</template>
