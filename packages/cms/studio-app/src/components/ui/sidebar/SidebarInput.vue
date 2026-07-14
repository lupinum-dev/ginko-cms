<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Input } from '../input'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Input
    data-slot="sidebar-input"
    data-sidebar="input"
    :class="cn('ginko:bg-background ginko:h-8 ginko:w-full ginko:shadow-none', props.class)"
  >
    <slot />
  </Input>
</template>
