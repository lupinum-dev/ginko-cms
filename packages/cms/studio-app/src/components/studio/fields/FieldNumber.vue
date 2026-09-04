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
  <StudioFieldShell
    :for="field.key"
    :label="label"
    :required="field.required"
    :description="field.description"
    :error="fieldError"
  >
    <Input
      :id="field.key"
      v-model.number="value"
      type="number"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :aria-invalid="fieldError ? true : undefined"
    />
  </StudioFieldShell>
</template>
