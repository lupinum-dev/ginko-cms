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
      <Icon v-if="value" :name="value as string" class="ginko:size-5 ginko:text-muted-foreground" />
      <Input
        :id="field.key"
        v-model="value"
        :aria-invalid="fieldError ? true : undefined"
        class="ginko:flex-1 ginko:font-mono ginko:text-sm"
        placeholder="lucide:star"
      />
    </div>
  </StudioFieldShell>
</template>
