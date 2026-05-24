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

function updateMultiselectOption(event: Event, option: string) {
  const checked = (event.target as HTMLInputElement).checked
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
          type="checkbox"
          :checked="Array.isArray(value) && value.includes(opt)"
          class="ginko:rounded ginko:border"
          @change="updateMultiselectOption($event, opt)"
        />
        {{ opt }}
      </label>
    </div>
  </div>
</template>
