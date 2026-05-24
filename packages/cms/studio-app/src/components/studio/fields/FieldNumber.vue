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
    <Label :for="field.key" class="ginko:text-sm">
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </Label>
    <Input
      :id="field.key"
      v-model.number="value"
      type="number"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :class="fieldError ? 'ginko:border-destructive' : ''"
    />
    <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
      {{ field.description }}
    </p>
    <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
      {{ fieldError }}
    </p>
  </div>
</template>
