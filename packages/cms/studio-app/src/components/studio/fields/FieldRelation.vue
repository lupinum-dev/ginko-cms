<script setup lang="ts">
import { Check, ChevronsUpDown, Search, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { FieldDefinition } from './useFieldCommon'
import { useRelationEntries } from './useRelationEntries'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  locale?: string
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

const relationSearch = ref('')
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const { relatedEntries, entryByStableId, hasMoreEntries, status } = useRelationEntries(
  computed(() => props.field),
  computed(() => props.locale),
  computed(() => relationSearch.value),
)
const filteredRelatedEntries = computed(() => {
  return relatedEntries.value
})
const selectedStableId = computed(() => (typeof value.value === 'string' ? value.value : ''))
const selectedEntry = computed(() => {
  if (!selectedStableId.value) return null
  return (
    entryByStableId.value.get(selectedStableId.value) ?? {
      _id: selectedStableId.value,
      stableId: selectedStableId.value,
      title: selectedStableId.value,
      slug: '',
    }
  )
})

const relationCollectionId = computed(() => props.field.relation?.collectionId ?? '')
const relationHelpText = computed(() => {
  if (props.field.description) return props.field.description
  if (!relationCollectionId.value) return null
  return props.field.required
    ? t('ginkoCms.studio.fieldRenderer.requiredRelationHelp', {
        collection: relationCollectionId.value,
      })
    : t('ginkoCms.studio.fieldRenderer.optionalRelationHelp', {
        collection: relationCollectionId.value,
      })
})

const relationEmptyStateText = computed(() => {
  if (filteredRelatedEntries.value.length > 0 || !relationCollectionId.value) return null
  if (status.value === 'loading-first-page') return null
  if (relatedEntries.value.length === 0) {
    return t('ginkoCms.studio.fieldRenderer.noRelationEntries', {
      collection: relationCollectionId.value,
    })
  }
  return t('ginkoCms.studio.fieldRenderer.noMatchingEntries')
})

function selectRelation(stableId: string) {
  value.value = stableId
  relationSearch.value = ''
  open.value = false
}

function clearRelation() {
  value.value = ''
  relationSearch.value = ''
  open.value = false
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || root.value?.contains(target)) return
  open.value = false
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
</script>

<template>
  <div ref="root" class="ginko:relative">
    <StudioFieldShell
      :for="field.key"
      :label="label"
      :required="field.required"
      :description="relationHelpText ?? undefined"
      :error="fieldError"
    >
      <template v-if="field.localized" #action>
        <span
          class="ginko:text-sm ginko:text-muted-foreground"
          :title="t('ginkoCms.studio.fieldRenderer.localizedField')"
        >
          🌐
        </span>
      </template>
      <Button
        :id="field.key"
        variant="outline"
        class="ginko:h-auto ginko:min-h-9 ginko:w-full ginko:justify-between ginko:gap-2 ginko:px-3 ginko:py-1.5 ginko:text-left ginko:font-normal"
        :aria-expanded="open"
        :aria-invalid="fieldError ? true : undefined"
        @click="open = !open"
      >
        <span v-if="selectedEntry" class="ginko:min-w-0">
          <span class="ginko:block ginko:truncate ginko:font-medium">{{
            selectedEntry.title
          }}</span>
          <span
            v-if="selectedEntry.slug"
            class="ginko:block ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            {{ selectedEntry.slug }}
          </span>
        </span>
        <span v-else class="ginko:truncate ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.fieldRenderer.selectRelatedEntry') }}
        </span>
        <ChevronsUpDown class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
      </Button>
      <div
        v-if="open"
        class="ginko:mt-1 ginko:w-full ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-popover ginko:text-popover-foreground ginko:shadow-md"
      >
        <div class="ginko:border-b ginko:border-border/40 ginko:p-2">
          <div class="ginko:relative">
            <Search
              class="ginko:pointer-events-none ginko:absolute ginko:left-2.5 ginko:top-1/2 ginko:size-3.5 ginko:-translate-y-1/2 ginko:text-muted-foreground/60"
            />
            <Input
              v-model="relationSearch"
              :placeholder="t('ginkoCms.studio.fieldRenderer.searchEntries')"
              class="ginko:h-8 ginko:border-border/40 ginko:bg-card ginko:pl-8 ginko:text-sm ginko:shadow-none"
              @keydown.stop
            />
          </div>
        </div>
        <div class="ginko:max-h-72 ginko:overflow-y-auto ginko:p-1">
          <Button
            v-if="!field.required && selectedStableId"
            variant="ghost"
            class="ginko:h-auto ginko:w-full ginko:justify-start ginko:gap-2 ginko:px-2 ginko:py-2 ginko:text-left ginko:text-sm ginko:font-normal ginko:text-muted-foreground"
            @click="clearRelation"
          >
            <X class="ginko:size-4" />
            {{ t('ginkoCms.common.none') }}
          </Button>
          <Button
            v-for="relatedEntry in filteredRelatedEntries"
            :key="relatedEntry._id"
            variant="ghost"
            class="ginko:h-auto ginko:w-full ginko:justify-start ginko:gap-3 ginko:px-2 ginko:py-2 ginko:text-left ginko:text-sm ginko:font-normal"
            @click="selectRelation(relatedEntry.stableId)"
          >
            <span
              class="ginko:grid ginko:size-5 ginko:shrink-0 ginko:place-items-center ginko:rounded ginko:border"
              :class="
                selectedStableId === relatedEntry.stableId
                  ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                  : 'ginko:border-border'
              "
            >
              <Check v-if="selectedStableId === relatedEntry.stableId" class="ginko:size-3.5" />
            </span>
            <span class="ginko:min-w-0 ginko:flex-1">
              <span class="ginko:block ginko:truncate ginko:font-medium">{{
                relatedEntry.title
              }}</span>
              <span
                class="ginko:block ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
              >
                {{ relatedEntry.slug || relatedEntry.stableId }}
              </span>
            </span>
          </Button>
          <div
            v-if="relationEmptyStateText"
            class="ginko:px-2 ginko:py-3 ginko:text-sm ginko:text-muted-foreground"
          >
            {{ relationEmptyStateText }}
          </div>
          <div
            v-else-if="hasMoreEntries"
            class="ginko:px-2 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
          >
            Keep typing to narrow more entries.
          </div>
        </div>
      </div>
    </StudioFieldShell>
  </div>
</template>
