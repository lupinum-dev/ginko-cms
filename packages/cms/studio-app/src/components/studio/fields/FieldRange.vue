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
    <template #action>
      <span
        class="ginko:text-sm ginko:font-medium ginko:tabular-nums ginko:text-muted-foreground"
        >{{ value }}</span
      >
    </template>
    <input
      :id="field.key"
      v-model.number="value"
      type="range"
      :min="field.min ?? 0"
      :max="field.max ?? 100"
      :step="field.step ?? 1"
      :aria-invalid="fieldError ? true : undefined"
      class="ginko:w-full ginko:accent-primary"
    />
    <div class="ginko:flex ginko:justify-between ginko:text-xs ginko:text-muted-foreground">
      <span>{{ field.min ?? 0 }}</span>
      <span>{{ field.max ?? 100 }}</span>
    </div>
  </StudioFieldShell>
</template>
