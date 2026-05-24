<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
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

const { t } = useCmsI18n()
const EMPTY_SELECT_VALUE = '__ginko_none__'
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v === EMPTY_SELECT_VALUE ? '' : v),
})
</script>

<template>
  <div class="ginko:space-y-1.5">
    <Label :for="field.key" class="ginko:text-sm">
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </Label>
    <Select v-model="value">
      <SelectTrigger :class="fieldError ? 'ginko:border-destructive' : ''">
        <SelectValue :placeholder="label" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-if="!field.required" :value="EMPTY_SELECT_VALUE">
          <span class="ginko:text-muted-foreground">{{ t('ginkoCms.common.none') }}</span>
        </SelectItem>
        <SelectItem v-for="opt in field.options ?? []" :key="opt" :value="opt">
          {{ opt }}
        </SelectItem>
      </SelectContent>
    </Select>
    <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
      {{ field.description }}
    </p>
    <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
      {{ fieldError }}
    </p>
  </div>
</template>
