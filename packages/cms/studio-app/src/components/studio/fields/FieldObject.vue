<script setup lang="ts">
import { computed } from 'vue'

import type { FieldContext, FieldDefinition } from './useFieldCommon'
import { asFieldContext } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  context?: FieldContext
  locale?: string
  assetContext?: FieldContext
  errors?: Array<{ field: string; message: string }>
  fieldPath?: string
  showValidation?: boolean
  label: string
  fieldError: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (v) => {
    if (props.disabled) return
    emit('update:modelValue', v)
  },
})

const nestedFields = computed(() => props.field.fields ?? [])
const objectValue = computed(() => asFieldContext(value.value))

function updateObjectField(fieldKey: string, nextValue: unknown) {
  if (props.disabled) return
  value.value = {
    ...objectValue.value,
    [fieldKey]: nextValue,
  }
}
</script>

<template>
  <FieldSet
    class="ginko:col-span-full ginko:space-y-3 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-4 ginko:aria-invalid:border-destructive"
    :aria-invalid="fieldError ? true : undefined"
    :data-invalid="fieldError ? true : undefined"
  >
    <div>
      <FieldLegend variant="label">
        {{ label }}
        <span v-if="field.required" class="ginko:text-destructive">*</span>
      </FieldLegend>
      <FieldDescription v-if="field.description">
        {{ field.description }}
      </FieldDescription>
      <FieldError v-if="fieldError">
        {{ fieldError }}
      </FieldError>
    </div>
    <div class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-2">
      <StudioFieldRenderer
        v-for="nestedField in nestedFields"
        :key="nestedField.key"
        :field="nestedField"
        :model-value="objectValue[nestedField.key]"
        :context="objectValue"
        :locale="locale"
        :asset-context="assetContext"
        :errors="errors"
        :field-path="fieldPath ? `${fieldPath}.${nestedField.key}` : nestedField.key"
        :show-validation="showValidation"
        :disabled="disabled"
        @update:model-value="updateObjectField(nestedField.key, $event)"
      />
    </div>
  </FieldSet>
</template>
