<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p
    data-slot="item-description"
    :class="
      cn(
        'ginko:line-clamp-2 ginko:text-sm ginko:leading-normal ginko:font-normal ginko:text-muted-foreground ginko:[&>a]:underline ginko:[&>a]:underline-offset-4 ginko:[&>a:hover]:text-primary',
        props.class,
      )
    "
  >
    <slot />
  </p>
</template>
