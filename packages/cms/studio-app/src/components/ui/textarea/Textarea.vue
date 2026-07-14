<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  defaultValue?: string | number
  modelValue?: string | number
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
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :class="
      cn(
        'ginko:border-input ginko:placeholder:text-muted-foreground ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:aria-invalid:border-destructive ginko:dark:bg-input/30 ginko:dark:disabled:bg-input/80 ginko:flex ginko:field-sizing-content ginko:min-h-16 ginko:w-full ginko:rounded-lg ginko:border ginko:bg-transparent ginko:px-2.5 ginko:py-2 ginko:text-base ginko:transition-colors ginko:outline-none ginko:focus-visible:ring-[3px] ginko:disabled:cursor-not-allowed ginko:disabled:bg-input/50 ginko:disabled:opacity-50 ginko:md:text-sm',
        props.class,
      )
    "
  />
</template>
