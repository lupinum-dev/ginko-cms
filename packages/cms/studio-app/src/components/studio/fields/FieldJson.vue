<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

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

const jsonError = ref<string | null>(null)
const rawValue = ref(formatJsonValue(props.modelValue))
let ignoreNextModelSync = false

function formatJsonValue(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }
  return JSON.stringify(input ?? {}, null, 2)
}

watch(
  () => props.modelValue,
  (nextValue) => {
    if (ignoreNextModelSync) {
      ignoreNextModelSync = false
      return
    }
    rawValue.value = formatJsonValue(nextValue)
    jsonError.value = null
  },
  { deep: true },
)

function updateJsonValue(nextValue: string) {
  rawValue.value = nextValue
  try {
    const parsed = JSON.parse(nextValue)
    ignoreNextModelSync = true
    value.value = parsed
    void nextTick(() => {
      ignoreNextModelSync = false
    })
    jsonError.value = null
  } catch (error) {
    jsonError.value = t('ginkoCms.studio.fieldRenderer.invalidJson', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
</script>

<template>
  <StudioFieldShell
    class="ginko:col-span-2"
    :for="field.key"
    :label="label"
    :required="field.required"
    :description="field.description"
    :error="jsonError || fieldError"
  >
    <Textarea
      :id="field.key"
      :model-value="rawValue"
      :aria-invalid="jsonError || fieldError ? true : undefined"
      class="ginko:min-h-[200px] ginko:font-mono ginko:text-sm"
      @update:model-value="updateJsonValue"
    />
  </StudioFieldShell>
</template>
