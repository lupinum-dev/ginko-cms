<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AvatarRoot } from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AvatarRoot
    data-slot="avatar"
    :class="
      cn(
        'ginko:relative ginko:flex ginko:size-8 ginko:shrink-0 ginko:overflow-hidden ginko:rounded-full',
        props.class,
      )
    "
  >
    <slot />
  </AvatarRoot>
</template>
