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
    class="ginko:col-span-2"
    :for="field.key"
    :label="label"
    :required="field.required"
    :description="field.description"
    :error="fieldError"
  >
    <Textarea
      :id="field.key"
      v-model="value"
      :aria-invalid="fieldError ? true : undefined"
      class="ginko:min-h-[200px] ginko:font-mono ginko:text-sm"
      :placeholder="
        field.language
          ? t('ginkoCms.studio.fieldRenderer.languageCodePlaceholder', {
              language: field.language,
            })
          : t('ginkoCms.studio.fieldRenderer.codePlaceholder')
      "
    />
  </StudioFieldShell>
</template>
