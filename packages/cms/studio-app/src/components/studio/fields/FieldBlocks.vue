<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import { fieldDisplayLabel, humanizeFieldKey } from '../../../lib/fieldLabel'
import type { FieldContext, FieldDefinition } from './useFieldCommon'
import { asFieldContext, createDefaultRecord } from './useFieldCommon'

type BlockItem = {
  type: string
  data: FieldContext
}

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
const value = computed({
  get: () => props.modelValue,
  set: (v) => {
    if (props.disabled) return
    emit('update:modelValue', v)
  },
})

const nestedFields = computed(() => props.field.fields ?? [])
const blockItems = computed<BlockItem[]>(() =>
  Array.isArray(value.value)
    ? value.value.map((item) => {
        const block = asFieldContext(item)
        return {
          type: typeof block.type === 'string' ? block.type : '',
          data: asFieldContext(block.data),
        }
      })
    : [],
)
const blockTypeToAdd = ref('')
const collapsedItems = ref(new Set<number>())

function blockTypeLabel(type: string): string {
  const nested = nestedFields.value.find((candidate) => candidate.key === type)
  return nested ? fieldDisplayLabel(nested) : humanizeFieldKey(type)
}

function toggleItemCollapse(index: number) {
  const next = new Set(collapsedItems.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsedItems.value = next
}

function addBlock() {
  if (props.disabled) return
  if (!blockTypeToAdd.value) return
  const items = [...blockItems.value]
  const blockDefinition = nestedFields.value.find((field) => field.key === blockTypeToAdd.value)
  if (!blockDefinition) return
  items.push({
    type: blockDefinition.key,
    data: createDefaultRecord(blockDefinition.fields ?? []),
  })
  value.value = items
  blockTypeToAdd.value = ''
}

function updateBlockField(index: number, fieldKey: string, nextValue: unknown) {
  if (props.disabled) return
  const items = [...blockItems.value]
  const existing = items[index] ?? { type: '', data: {} }
  items[index] = {
    ...existing,
    data: {
      ...existing.data,
      [fieldKey]: nextValue,
    },
  }
  value.value = items
}

function removeBlock(index: number) {
  if (props.disabled) return
  const items = [...blockItems.value]
  items.splice(index, 1)
  value.value = items
}
</script>

<template>
  <FieldSet
    class="ginko:col-span-full ginko:space-y-3 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-4 ginko:aria-invalid:border-destructive"
    :aria-invalid="fieldError ? true : undefined"
    :data-invalid="fieldError ? true : undefined"
  >
    <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
      <div class="ginko:min-w-0">
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
      <div
        v-if="!disabled"
        class="ginko:flex ginko:min-w-0 ginko:flex-wrap ginko:items-center ginko:gap-2"
      >
        <Select v-model="blockTypeToAdd">
          <SelectTrigger class="ginko:w-40 ginko:max-w-full">
            <SelectValue :placeholder="t('ginkoCms.studio.fieldRenderer.blockType')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="block in nestedFields" :key="block.key" :value="block.key">
              {{ fieldDisplayLabel(block) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" @click="addBlock">
          {{ t('ginkoCms.studio.fieldRenderer.addBlock') }}
        </Button>
      </div>
    </div>
    <div v-if="blockItems.length > 0" class="ginko:space-y-3">
      <div
        v-for="(block, index) in blockItems"
        :key="`${block.type}-${index}`"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-1"
      >
        <div class="ginko:flex ginko:items-center ginko:justify-between">
          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:gap-1.5 ginko:px-2"
            @click="toggleItemCollapse(index)"
          >
            <Icon
              :name="collapsedItems.has(index) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
              class="ginko:size-3 ginko:text-muted-foreground"
            />
            <Badge variant="outline">
              {{ blockTypeLabel(block.type) }}
            </Badge>
          </Button>
          <Button v-if="!disabled" variant="ghost" size="sm" @click="removeBlock(index)">
            <Trash2 class="ginko:size-4" />
          </Button>
        </div>
        <div
          v-if="!collapsedItems.has(index)"
          class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:pt-2 ginko:@3xl:grid-cols-2"
        >
          <StudioFieldRenderer
            v-for="nestedField in nestedFields.find((field2) => field2.key === block.type)
              ?.fields ?? []"
            :key="nestedField.key"
            :field="nestedField"
            :model-value="block.data?.[nestedField.key]"
            :context="block.data ?? {}"
            :locale="locale"
            :asset-context="assetContext"
            :errors="errors"
            :field-path="fieldPath ? `${fieldPath}.${nestedField.key}` : nestedField.key"
            :show-validation="showValidation"
            :disabled="disabled"
            @update:model-value="updateBlockField(index, nestedField.key, $event)"
          />
        </div>
      </div>
    </div>
  </FieldSet>
</template>
