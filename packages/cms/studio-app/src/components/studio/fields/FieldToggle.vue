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
  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:py-1">
    <div>
      <Label :for="field.key" class="ginko:text-sm">{{ label }}</Label>
      <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
        {{ field.description }}
      </p>
    </div>
    <Switch :id="field.key" :checked="!!value" @update:checked="value = $event" />
  </div>
</template>
