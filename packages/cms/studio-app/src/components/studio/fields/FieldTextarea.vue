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
  <StudioFieldShell
    :for="field.key"
    :label="label"
    :required="field.required"
    :description="field.description"
    :error="fieldError"
  >
    <Textarea
      :id="field.key"
      v-model="value"
      :placeholder="
        t('ginkoCms.studio.fieldRenderer.textareaPlaceholder', {
          label: label.toLowerCase(),
        })
      "
      :class="['ginko:min-h-[120px]', fieldError ? 'ginko:border-destructive' : '']"
    />
  </StudioFieldShell>
</template>
