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

function updateMultiselectOption(checked: boolean, option: string) {
  const arr = Array.isArray(value.value) ? [...(value.value as string[])] : []
  if (checked && !arr.includes(option)) {
    arr.push(option)
  } else if (!checked) {
    const index = arr.indexOf(option)
    if (index >= 0) {
      arr.splice(index, 1)
    }
  }
  value.value = arr
}
</script>

<template>
  <FieldSet :data-invalid="fieldError ? true : undefined">
    <FieldLegend>
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </FieldLegend>
    <div class="ginko:space-y-2">
      <Field v-for="opt in field.options ?? []" :key="opt" orientation="horizontal">
        <Checkbox
          :id="`${field.key}-${opt}`"
          :model-value="Array.isArray(value) && value.includes(opt)"
          :aria-invalid="fieldError ? true : undefined"
          @update:model-value="updateMultiselectOption($event === true, opt)"
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
