<script setup lang="ts">
import { computed } from 'vue'

import type { FieldDefinition } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  label: string
  fieldError: string | null
  disabled?: boolean
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
  <Field
    :invalid="Boolean(fieldError)"
    orientation="horizontal"
    class="ginko:items-start ginko:py-1"
  >
    <Checkbox
      :id="field.key"
      :model-value="Boolean(value)"
      :disabled="disabled"
      class="ginko:mt-0.5"
      @update:model-value="value = $event === true"
    />
    <FieldContent>
      <FieldLabel :for="field.key" class="ginko:text-sm">{{ label }}</FieldLabel>
      <FieldDescription v-if="field.description">
        {{ field.description }}
      </FieldDescription>
      <FieldError v-if="fieldError">{{ fieldError }}</FieldError>
    </FieldContent>
  </Field>
</template>
