<script setup lang="ts">
import { computed } from 'vue'

import type { StudioField } from '../../../composables/internal/types'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { fieldDisplayLabel } from '../../../lib/fieldLabel'
import { getClientFieldError } from '../fields/useFieldCommon'

// Dumb writing-surface header: the title as a large borderless heading, the
// description as a quiet subtitle. No context inject — parents own the data
// flow (primary draft vs secondary locale) and pass values/emits through, so
// the same component serves the page-level shared hero and each locale panel.
const props = defineProps<{
  titleField: StudioField
  descriptionField?: StudioField | null
  values: Record<string, unknown>
  disabled?: boolean
  /** Prefixes DOM ids (e.g. 'secondary-') so compare panes stay unique. */
  idPrefix?: string
  showValidation?: boolean
}>()

const emit = defineEmits<{
  update: [fieldKey: string, value: string]
  blur: [fieldKey: string]
}>()

const { t } = useCmsI18n()

const titleId = computed(() => `${props.idPrefix ?? ''}${props.titleField.key}`)
const descriptionId = computed(() =>
  props.descriptionField ? `${props.idPrefix ?? ''}${props.descriptionField.key}` : '',
)

// Writers must never see raw schema keys (DESIGN.md rule 6): shared echo-aware
// humanizer covers sr-only labels and the required-error copy.
function fieldLabel(field: StudioField): string {
  return fieldDisplayLabel(field)
}

const titleValue = computed(() => {
  const value = props.values[props.titleField.key]
  return typeof value === 'string' ? value : ''
})
const descriptionValue = computed(() => {
  if (!props.descriptionField) return ''
  const value = props.values[props.descriptionField.key]
  return typeof value === 'string' ? value : ''
})

// Borderless inputs cannot signal errors with a border — they use an error
// line below plus aria-invalid (surfaced as a subtle underline).
const titleError = computed(() =>
  props.showValidation
    ? getClientFieldError(props.titleField, titleValue.value, fieldLabel(props.titleField), t)
    : null,
)

function onInput(field: StudioField, event: Event) {
  emit('update', field.key, (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="studio-entry-hero ginko:space-y-1">
    <label :for="titleId" class="ginko:sr-only">{{ fieldLabel(titleField) }}</label>
    <textarea
      :id="titleId"
      :value="titleValue"
      :disabled="disabled"
      :placeholder="t('ginkoCms.common.untitled')"
      :aria-invalid="titleError ? 'true' : undefined"
      rows="1"
      class="studio-entry-hero__title ginko:field-sizing-content ginko:m-0 ginko:block ginko:w-full ginko:resize-none ginko:overflow-hidden ginko:border-0 ginko:bg-transparent ginko:p-0 ginko:text-2xl ginko:font-semibold ginko:leading-tight ginko:tracking-tight ginko:text-foreground ginko:outline-none ginko:placeholder:text-muted-foreground/40 ginko:aria-invalid:underline ginko:aria-invalid:decoration-destructive/60 ginko:aria-invalid:decoration-2 ginko:aria-invalid:underline-offset-4 ginko:@3xl:text-3xl"
      @input="onInput(titleField, $event)"
      @blur="emit('blur', titleField.key)"
    />
    <p v-if="titleError" class="ginko:text-xs ginko:font-medium ginko:text-destructive">
      {{ titleError }}
    </p>

    <template v-if="descriptionField">
      <label :for="descriptionId" class="ginko:sr-only">{{ fieldLabel(descriptionField) }}</label>
      <textarea
        :id="descriptionId"
        :value="descriptionValue"
        :disabled="disabled"
        :placeholder="t('ginkoCms.studio.collectionEditor.heroDescriptionPlaceholder')"
        rows="1"
        class="studio-entry-hero__description ginko:field-sizing-content ginko:m-0 ginko:block ginko:w-full ginko:resize-none ginko:overflow-hidden ginko:border-0 ginko:bg-transparent ginko:p-0 ginko:text-base ginko:leading-relaxed ginko:text-muted-foreground ginko:outline-none ginko:placeholder:text-muted-foreground/40"
        @input="onInput(descriptionField, $event)"
        @blur="emit('blur', descriptionField.key)"
      />
    </template>
  </div>
</template>
