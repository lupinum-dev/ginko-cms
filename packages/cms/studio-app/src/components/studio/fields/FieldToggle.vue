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
    :data-invalid="Boolean(fieldError) || undefined"
    orientation="horizontal"
    class="ginko:justify-between ginko:py-1"
  >
    <FieldContent>
      <FieldLabel :for="field.key" class="ginko:text-sm">{{ label }}</FieldLabel>
      <FieldDescription v-if="field.description">
        {{ field.description }}
      </FieldDescription>
      <FieldError v-if="fieldError">{{ fieldError }}</FieldError>
    </FieldContent>
    <Switch
      :id="field.key"
      :checked="!!value"
      :disabled="disabled"
      :aria-invalid="fieldError ? true : undefined"
      @update:checked="value = $event"
    />
  </Field>
</template>
