<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { FieldContext, FieldDefinition } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  assetContext?: FieldContext
  label: string
  fieldError: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useCmsI18n()
const value = computed<string | string[] | null>({
  get: () => {
    if (Array.isArray(props.modelValue))
      return props.modelValue.filter((item) => typeof item === 'string')
    return typeof props.modelValue === 'string' ? props.modelValue : null
  },
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
    <StudioAssetPicker
      v-if="assetContext"
      :model-value="value"
      :kind="field.type === 'image' ? 'image' : 'file'"
      :accept="field.media?.accept"
      :aspect-ratio="field.media?.aspectRatio"
      :label="label"
      :asset-context="assetContext"
      :disabled="disabled"
      @update:model-value="value = $event"
    />
    <Input
      v-else
      :id="field.key"
      v-model="value"
      :disabled="disabled"
      class="ginko:font-mono ginko:text-sm"
      :placeholder="
        field.type === 'image'
          ? t('ginkoCms.studio.fieldRenderer.assetImagePlaceholder')
          : t('ginkoCms.studio.fieldRenderer.assetFilePlaceholder')
      "
    />
  </StudioFieldShell>
</template>
