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
    <div class="ginko:flex ginko:items-center ginko:gap-2">
      <input
        :id="field.key"
        v-model="value"
        type="color"
        :aria-invalid="fieldError ? true : undefined"
        class="ginko:size-8 ginko:rounded ginko:border ginko:cursor-pointer"
      />
      <Input
        v-model="value"
        :aria-invalid="fieldError ? true : undefined"
        class="ginko:flex-1 ginko:font-mono ginko:text-sm"
        placeholder="#000000"
      />
    </div>
  </StudioFieldShell>
</template>
