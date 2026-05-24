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
    <div class="ginko:flex ginko:items-center ginko:justify-between">
      <Label :for="field.key" class="ginko:text-sm">
        {{ label }}
        <span v-if="field.required" class="ginko:text-destructive">*</span>
      </Label>
      <span
        class="ginko:text-sm ginko:font-medium ginko:tabular-nums ginko:text-muted-foreground"
        >{{ value }}</span
      >
    </div>
    <input
      :id="field.key"
      v-model.number="value"
      type="range"
      :min="field.min ?? 0"
      :max="field.max ?? 100"
      :step="field.step ?? 1"
      class="ginko:w-full ginko:accent-primary"
    />
    <div class="ginko:flex ginko:justify-between ginko:text-[10px] ginko:text-muted-foreground">
      <span>{{ field.min ?? 0 }}</span>
      <span>{{ field.max ?? 100 }}</span>
    </div>
    <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
      {{ field.description }}
    </p>
  </div>
</template>
