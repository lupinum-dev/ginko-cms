<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p
    data-slot="field-description"
    :class="
      cn(
        'ginko:text-muted-foreground ginko:text-sm ginko:leading-normal ginko:font-normal ginko:group-has-[[data-orientation=horizontal]]/field:text-balance',
        'ginko:last:mt-0 ginko:nth-last-2:-mt-1 ginko:[[data-variant=legend]+&]:-mt-1.5',
        'ginko:[&>a:hover]:text-primary ginko:[&>a]:underline ginko:[&>a]:underline-offset-4',
        props.class,
      )
    "
  >
    <slot />
  </p>
</template>
