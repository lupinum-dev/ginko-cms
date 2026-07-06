<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
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
const value = computed<string[]>({
  get: () =>
    Array.isArray(props.modelValue)
      ? props.modelValue.filter((item): item is string => typeof item === 'string')
      : [],
  set: (v) => {
    if (props.disabled) return
    emit('update:modelValue', v)
  },
})

function addMediaItem() {
  if (props.disabled) return
  const items = [...value.value]
  items.push('')
  value.value = items
}

function updateMediaItem(index: number, nextValue: string) {
  if (props.disabled) return
  const items = [...value.value]
  items[index] = nextValue
  value.value = items
}

function removeMediaItem(index: number) {
  if (props.disabled) return
  const items = [...value.value]
  items.splice(index, 1)
  value.value = items
}

function updateImages(nextValue: string | string[]) {
  if (props.disabled) return
  value.value = Array.isArray(nextValue) ? nextValue : [nextValue]
}
</script>

<template>
  <FieldSet class="ginko:space-y-2" :data-invalid="fieldError ? true : undefined">
    <div class="ginko:flex ginko:items-center ginko:justify-between">
      <div>
        <FieldLegend variant="label">
          {{ label }}
          <span v-if="field.required" class="ginko:text-destructive">*</span>
        </FieldLegend>
        <FieldDescription v-if="field.description">
          {{ field.description }}
        </FieldDescription>
        <FieldError v-if="fieldError">
          {{ fieldError }}
        </FieldError>
      </div>
      <Button v-if="!assetContext && !disabled" variant="outline" size="sm" @click="addMediaItem">
        {{ t('ginkoCms.studio.fieldRenderer.addImage') }}
      </Button>
    </div>
    <StudioAssetPicker
      v-if="assetContext"
      :model-value="value"
      multiple
      kind="image"
      :accept="field.media?.accept"
      :aspect-ratio="field.media?.aspectRatio"
      :label="label"
      :asset-context="assetContext"
      :disabled="disabled"
      @update:model-value="updateImages"
    />
    <div v-else-if="Array.isArray(value)" class="ginko:space-y-2">
      <div
        v-for="(item, index) in value"
        :key="index"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-2"
      >
        <div class="ginko:flex ginko:gap-2">
          <Input
            :model-value="item"
            class="ginko:font-mono ginko:text-sm"
            :placeholder="t('ginkoCms.studio.fieldRenderer.assetImagePlaceholder')"
            :disabled="disabled"
            @update:model-value="updateMediaItem(index, $event)"
          />
          <Button v-if="!disabled" variant="ghost" size="sm" @click="removeMediaItem(index)">
            <Trash2 class="ginko:size-4" />
          </Button>
        </div>
      </div>
    </div>
  </FieldSet>
</template>
