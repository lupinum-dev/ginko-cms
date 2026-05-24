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
    <Label class="ginko:text-sm">
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </Label>
    <div class="ginko:space-y-2">
      <label
        v-for="opt in field.options ?? []"
        :key="opt"
        class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm"
      >
        <input
          type="radio"
          :name="field.key"
          :value="opt"
          :checked="value === opt"
          class="ginko:text-primary"
          @change="value = opt"
        />
        {{ opt }}
      </label>
    </div>
    <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
      {{ field.description }}
    </p>
    <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
      {{ fieldError }}
    </p>
  </div>
</template>
