<script setup lang="ts">
import { evaluateFieldCondition } from '@public/utils/cmsFields'
import type { PropType } from 'vue'
import { computed } from 'vue'

import type { StudioField } from '../../composables/internal/types'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { fieldDisplayLabel } from '../../lib/fieldLabel'
import { fieldComponents, getDefault, getClientFieldError, getConditionHint } from './fields'

defineOptions({ name: 'StudioFieldRenderer' })

type FieldError = {
  field: string
  message: string
}

const props = defineProps({
  field: { type: Object as PropType<StudioField>, required: true },
  modelValue: { type: null, required: true },
  context: {
    type: Object as PropType<Record<string, unknown>>,
    required: false,
  },
  locale: { type: String, required: false },
  assetContext: {
    type: Object as PropType<Record<string, unknown>>,
    required: false,
  },
  errors: { type: Array as PropType<FieldError[]>, required: false },
  fieldPath: { type: String, required: false },
  showValidation: { type: Boolean, required: false, default: true },
  disabled: { type: Boolean, required: false, default: false },
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()
const { t } = useCmsI18n()
const normalizedField = computed(() => props.field)

const value = computed({
  get: () =>
    props.modelValue ??
    normalizedField.value.defaultValue ??
    getDefault(normalizedField.value.type, normalizedField.value.fields ?? undefined),
  set: (value) => emit('update:modelValue', value),
})
const label = computed(() => fieldDisplayLabel(normalizedField.value))
const fieldComponent = computed(() => {
  const component = fieldComponents[normalizedField.value.type]
  if (!component) {
    throw new Error(`Unsupported studio field type: ${normalizedField.value.type}`)
  }
  return component
})
const isVisible = computed(
  () =>
    !normalizedField.value.hidden &&
    evaluateFieldCondition(normalizedField.value.condition, props.context ?? {}),
)
const conditionHint = computed(() => getConditionHint(normalizedField.value.condition, t))
const fieldPath = computed(() => props.fieldPath || props.field.key)
const serverFieldError = computed(
  () =>
    props.errors?.find((e) => e.field === fieldPath.value || e.field === props.field.key)
      ?.message ?? null,
)
const fieldError = computed(
  () =>
    serverFieldError.value ||
    (props.showValidation
      ? getClientFieldError(normalizedField.value, value.value, label.value, t)
      : null),
)
</script>

<template>
  <div v-if="isVisible" :class="normalizedField.width === 'half' ? '' : 'ginko:col-span-2'">
    <p
      v-if="conditionHint"
      class="ginko:text-xs ginko:text-muted-foreground/60 ginko:italic ginko:mb-0.5"
    >
      {{ conditionHint }}
    </p>
    <component
      :is="fieldComponent"
      :field="normalizedField"
      :model-value="value"
      :context="context"
      :locale="locale"
      :asset-context="assetContext"
      :errors="errors"
      :field-path="fieldPath"
      :show-validation="showValidation"
      :disabled="disabled"
      :label="label"
      :field-error="fieldError"
      @update:model-value="value = $event"
    />
  </div>
</template>
