<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { FieldContext, FieldDefinition } from './useFieldCommon'
import { asFieldContext, createDefaultRecord } from './useFieldCommon'

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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useCmsI18n()
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const nestedFields = computed(() => props.field.fields ?? [])
const arrayItems = computed(() =>
  Array.isArray(value.value) ? value.value.map((item) => asFieldContext(item)) : [],
)
const collapsedItems = ref(new Set<number>())
const isSocialLinks = computed(() => {
  const keys = new Set(nestedFields.value.map((field) => field.key))
  return props.field.key.toLowerCase().includes('social') && keys.has('label') && keys.has('to')
})

function toggleItemCollapse(index: number) {
  const next = new Set(collapsedItems.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsedItems.value = next
}

function addArrayItem() {
  const items = [...arrayItems.value]
  items.push(createDefaultRecord(nestedFields.value))
  value.value = items
}

function updateArrayItem(index: number, fieldKey: string, nextValue: unknown) {
  const items = [...arrayItems.value]
  items[index] = {
    ...(items[index] ?? createDefaultRecord(nestedFields.value)),
    [fieldKey]: nextValue,
  }
  value.value = items
}

function removeArrayItem(index: number) {
  const items = [...arrayItems.value]
  items.splice(index, 1)
  value.value = items
}

function socialIconName(item: Record<string, unknown>) {
  const icon = typeof item.icon === 'string' ? item.icon : ''
  return icon || 'lucide:globe'
}
</script>

<template>
  <div
    class="ginko:col-span-full ginko:space-y-3 ginko:rounded-lg ginko:border ginko:p-4"
    :class="fieldError ? 'ginko:border-destructive' : 'ginko:border-border/40'"
  >
    <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
      <div class="ginko:min-w-0">
        <Label class="ginko:text-sm">
          {{ label }}
          <span v-if="field.required" class="ginko:text-destructive">*</span>
        </Label>
        <p v-if="field.description" class="ginko:text-xs ginko:text-muted-foreground">
          {{ field.description }}
        </p>
        <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
          {{ fieldError }}
        </p>
      </div>
      <Button variant="outline" size="sm" @click="addArrayItem">
        <Plus class="ginko:mr-1.5 ginko:size-3.5" />
        {{ t('ginkoCms.studio.fieldRenderer.addItem') }}
      </Button>
    </div>

    <div v-if="isSocialLinks" class="ginko:space-y-3">
      <div v-if="arrayItems.length > 0" class="ginko:grid ginko:gap-3">
        <div
          v-for="(item, index) in arrayItems"
          :key="index"
          class="ginko:grid ginko:grid-cols-[auto_minmax(0,1fr)_auto] ginko:items-center ginko:gap-2 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-[var(--studio-surface)] ginko:p-2 ginko:md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.35fr)_auto]"
        >
          <div
            class="ginko:grid ginko:size-8 ginko:place-items-center ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/40"
          >
            <Icon :name="socialIconName(item)" class="ginko:size-4" />
          </div>
          <Input
            :model-value="typeof item.label === 'string' ? item.label : ''"
            placeholder="Label"
            class="ginko:h-8"
            @update:model-value="updateArrayItem(index, 'label', $event)"
          />
          <Input
            :model-value="typeof item.to === 'string' ? item.to : ''"
            placeholder="URL"
            class="ginko:col-start-2 ginko:h-8 ginko:md:col-start-auto"
            @update:model-value="updateArrayItem(index, 'to', $event)"
          />
          <Button variant="ghost" size="icon" class="ginko:size-8" @click="removeArrayItem(index)">
            <Trash2 class="ginko:size-4" />
          </Button>
          <Input
            :model-value="typeof item.icon === 'string' ? item.icon : ''"
            placeholder="icon"
            class="ginko:col-start-2 ginko:col-span-1 ginko:h-8 ginko:font-mono ginko:text-xs ginko:md:col-span-2"
            @update:model-value="updateArrayItem(index, 'icon', $event)"
          />
        </div>
      </div>
      <div v-else class="ginko:text-sm ginko:text-muted-foreground">No social links yet.</div>
    </div>

    <div v-else-if="arrayItems.length > 0" class="ginko:space-y-3">
      <div
        v-for="(item, index) in arrayItems"
        :key="index"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-1"
      >
        <div class="ginko:flex ginko:items-center ginko:justify-between">
          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:gap-1 ginko:px-2 ginko:text-xs ginko:font-medium ginko:text-muted-foreground"
            @click="toggleItemCollapse(index)"
          >
            <Icon
              :name="collapsedItems.has(index) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
              class="ginko:size-3"
            />
            {{ t('ginkoCms.studio.fieldRenderer.itemLabel', { index: index + 1 }) }}
          </Button>
          <Button variant="ghost" size="sm" @click="removeArrayItem(index)">
            <Trash2 class="ginko:size-4" />
          </Button>
        </div>
        <div
          v-if="!collapsedItems.has(index)"
          class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:pt-2 ginko:md:grid-cols-2"
        >
          <StudioFieldRenderer
            v-for="nestedField in nestedFields"
            :key="nestedField.key"
            :field="nestedField"
            :model-value="item[nestedField.key]"
            :context="item"
            :locale="locale"
            :asset-context="assetContext"
            :errors="errors"
            :field-path="fieldPath ? `${fieldPath}.${nestedField.key}` : nestedField.key"
            :show-validation="showValidation"
            @update:model-value="updateArrayItem(index, nestedField.key, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
