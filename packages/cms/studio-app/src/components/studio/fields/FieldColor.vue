<script setup lang="ts">
import { computed } from 'vue'

import type { FieldDefinition } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  label: string
  fieldError: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <div class="ginko:space-y-1.5">
    <Label :for="field.key" class="ginko:text-sm">{{ label }}</Label>
    <div class="ginko:flex ginko:items-center ginko:gap-2">
      <input
        :id="field.key"
        v-model="value"
        type="color"
        class="ginko:size-8 ginko:rounded ginko:border ginko:cursor-pointer"
      />
      <Input
        v-model="value"
        class="ginko:flex-1 ginko:font-mono ginko:text-sm"
        placeholder="#000000"
      />
    </div>
  </div>
</template>
