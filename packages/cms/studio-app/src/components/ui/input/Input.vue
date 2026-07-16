<script setup lang="ts">
import { useVModel } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'ginko:file:text-foreground ginko:placeholder:text-muted-foreground ginko:selection:bg-primary ginko:selection:text-primary-foreground ginko:dark:bg-input/30 ginko:dark:disabled:bg-input/80 ginko:border-input ginko:h-8 ginko:w-full ginko:min-w-0 ginko:rounded-lg ginko:border ginko:bg-transparent ginko:px-2.5 ginko:py-1 ginko:text-base ginko:transition-colors ginko:outline-none ginko:file:inline-flex ginko:file:h-6 ginko:file:border-0 ginko:file:bg-transparent ginko:file:text-sm ginko:file:font-medium ginko:disabled:pointer-events-none ginko:disabled:cursor-not-allowed ginko:disabled:bg-input/50 ginko:disabled:opacity-50 ginko:md:text-sm',
        'ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:ring-[3px]',
        'ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:aria-invalid:border-destructive',
        props.class,
      )
    "
  />
</template>
