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
  <FieldSet :data-invalid="fieldError ? true : undefined">
    <FieldLegend>
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </FieldLegend>
    <div class="ginko:space-y-2">
      <Field v-for="opt in field.options ?? []" :key="opt" orientation="horizontal">
        <input
          :id="`${field.key}-${opt}`"
          type="radio"
          :name="field.key"
          :value="opt"
          :checked="value === opt"
          :aria-invalid="fieldError ? true : undefined"
          class="ginko:text-primary"
          @change="value = opt"
        />
        <FieldLabel :for="`${field.key}-${opt}`" class="ginko:text-sm">{{ opt }}</FieldLabel>
      </Field>
    </div>
    <FieldDescription v-if="field.description">
      {{ field.description }}
    </FieldDescription>
    <FieldError v-if="fieldError">
      {{ fieldError }}
    </FieldError>
  </FieldSet>
</template>
