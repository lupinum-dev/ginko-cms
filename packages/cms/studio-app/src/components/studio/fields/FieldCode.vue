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
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <div class="ginko:col-span-2 ginko:space-y-1.5">
    <Label :for="field.key" class="ginko:text-sm">
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </Label>
    <Textarea
      :id="field.key"
      v-model="value"
      class="ginko:min-h-[200px] ginko:font-mono ginko:text-sm"
      :placeholder="
        field.language
          ? t('ginkoCms.studio.fieldRenderer.languageCodePlaceholder', {
              language: field.language,
            })
          : t('ginkoCms.studio.fieldRenderer.codePlaceholder')
      "
    />
  </div>
</template>
