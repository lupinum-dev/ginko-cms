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
  <div
    class="ginko:col-span-full ginko:space-y-3 ginko:rounded-lg ginko:border ginko:p-4"
    :class="fieldError ? 'ginko:border-destructive' : 'ginko:border-border/40'"
  >
    <div>
      <Label class="ginko:text-sm">
        {{ label }}
        <span v-if="field.required" class="ginko:text-destructive">*</span>
      </Label>
      <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
        {{ field.description }}
      </p>
      <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
        {{ fieldError }}
      </p>
    </div>
    <div class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:md:grid-cols-2">
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
  </div>
</template>
