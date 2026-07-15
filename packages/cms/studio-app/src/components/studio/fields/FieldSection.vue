<script setup lang="ts">
import { ChevronsUpDown } from '@lucide/vue'
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { FieldContext, FieldDefinition } from './useFieldCommon'
import { asFieldContext } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  context?: FieldContext
  locale?: string
  assetContext?: FieldContext
  errors?: Array<{ field: string; message: string }>
  fieldPath?: string
  showValidation?: boolean
  label: string
  fieldError: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useCmsI18n()
const nestedFields = computed(() => props.field.fields ?? [])
const value = computed({
  get: () => props.modelValue,
  set: (v) => {
    if (props.disabled) return
    emit('update:modelValue', v)
  },
})
const sectionValue = computed(() => asFieldContext(value.value))
</script>

<template>
  <Collapsible :default-open="true" class="ginko:rounded-lg ginko:border ginko:col-span-2">
    <CollapsibleTrigger
      class="ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:px-3 ginko:py-2 ginko:text-left"
    >
      <div>
        <div class="studio-text-title ginko:text-foreground">
          {{ label }}
        </div>
        <p v-if="field.description" class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
          {{ field.description }}
        </p>
      </div>
      <ChevronsUpDown class="ginko:size-4 ginko:text-muted-foreground" />
    </CollapsibleTrigger>
    <CollapsibleContent class="ginko:px-3 ginko:pb-3">
      <div
        v-if="nestedFields.length > 0"
        class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-2 ginko:pt-2"
      >
        <StudioFieldRenderer
          v-for="subField in nestedFields"
          :key="subField.key"
          :field="subField"
          :model-value="sectionValue[subField.key]"
          :context="context"
          :locale="locale"
          :asset-context="assetContext"
          :errors="errors"
          :field-path="fieldPath ? `${fieldPath}.${subField.key}` : subField.key"
          :show-validation="showValidation"
          :disabled="disabled"
          @update:model-value="value = { ...sectionValue, [subField.key]: $event }"
        />
      </div>
      <p v-else class="ginko:text-xs ginko:text-muted-foreground ginko:pt-2">
        {{ t('ginkoCms.studio.fieldRenderer.sectionEmpty') }}
      </p>
    </CollapsibleContent>
  </Collapsible>
</template>
