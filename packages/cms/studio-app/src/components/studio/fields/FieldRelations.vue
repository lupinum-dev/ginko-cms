<script setup lang="ts">
import { Check, ChevronsUpDown, Search, X } from 'lucide-vue-next'
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
const selectedStableIds = computed(() => {
  return Array.isArray(value.value)
    ? value.value.filter((item): item is string => typeof item === 'string')
    : []
})
const selectedEntries = computed(() =>
  selectedStableIds.value.map(
    (stableId) =>
      entryByStableId.value.get(stableId) ?? {
        _id: stableId,
        stableId,
        title: stableId,
        slug: '',
      },
  ),
)
const filteredRelatedEntries = computed(() => {
  return relatedEntries.value
})

const relationCollectionId = computed(() => props.field.relation?.collectionId ?? '')
const relationHelpText = computed(() => {
  if (props.field.description) return props.field.description
  if (!relationCollectionId.value) return null
  return props.field.required
    ? t('ginkoCms.studio.fieldRenderer.requiredRelationsHelp', {
        collection: relationCollectionId.value,
      })
    : t('ginkoCms.studio.fieldRenderer.optionalRelationsHelp', {
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

function toggleRelationSelection(stableId: string) {
  const items = [...selectedStableIds.value]
  const index = items.indexOf(stableId)
  if (index >= 0) {
    items.splice(index, 1)
  } else {
    items.push(stableId)
  }
  value.value = items
}

function removeRelation(stableId: string) {
  value.value = selectedStableIds.value.filter((item) => item !== stableId)
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
  <div ref="root" class="ginko:relative ginko:space-y-1.5">
    <Label class="ginko:text-sm">
      {{ label }}
      <span v-if="field.required" class="ginko:text-destructive">*</span>
    </Label>
    <div
      role="button"
      tabindex="0"
      class="ginko:flex ginko:min-h-9 ginko:w-full ginko:items-start ginko:justify-between ginko:gap-2 ginko:rounded-md ginko:border ginko:bg-transparent ginko:px-2.5 ginko:py-1.5 ginko:text-left ginko:text-sm ginko:outline-none ginko:transition-[color,box-shadow] ginko:hover:bg-accent/40 ginko:focus-visible:border-ring ginko:focus-visible:ring-[3px] ginko:focus-visible:ring-ring/50"
      :class="fieldError ? 'ginko:border-destructive' : 'border-input'"
      :aria-expanded="open"
      @click="open = !open"
      @keydown.enter.prevent="open = !open"
      @keydown.space.prevent="open = !open"
    >
      <span
        v-if="selectedEntries.length"
        class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:flex-wrap ginko:gap-1.5"
      >
        <span
          v-for="selectedEntry in selectedEntries"
          :key="selectedEntry.stableId"
          class="ginko:inline-flex ginko:max-w-full ginko:items-center ginko:gap-1.5 ginko:rounded-full ginko:border ginko:border-border/40 ginko:bg-muted ginko:px-2 ginko:py-0.5 ginko:text-xs"
        >
          <span class="ginko:max-w-40 ginko:truncate">{{ selectedEntry.title }}</span>
          <span
            role="button"
            tabindex="0"
            class="ginko:rounded-full ginko:p-0.5 ginko:text-muted-foreground ginko:hover:bg-background ginko:hover:text-foreground"
            :aria-label="`Remove ${selectedEntry.title}`"
            @click.stop="removeRelation(selectedEntry.stableId)"
            @keydown.enter.stop.prevent="removeRelation(selectedEntry.stableId)"
            @keydown.space.stop.prevent="removeRelation(selectedEntry.stableId)"
          >
            <X class="ginko:size-3" />
          </span>
        </span>
      </span>
      <span v-else class="ginko:text-muted-foreground">
        {{ t('ginkoCms.studio.fieldRenderer.selectRelatedEntry') }}
      </span>
      <ChevronsUpDown
        class="ginko:ml-auto ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground"
      />
    </div>
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
          v-for="relatedEntry in filteredRelatedEntries"
          :key="relatedEntry._id"
          variant="ghost"
          class="ginko:h-auto ginko:w-full ginko:justify-start ginko:gap-3 ginko:px-2 ginko:py-2 ginko:text-left ginko:text-sm ginko:font-normal"
          @click="toggleRelationSelection(relatedEntry.stableId)"
        >
          <span
            class="ginko:grid ginko:size-5 ginko:shrink-0 ginko:place-items-center ginko:rounded ginko:border"
            :class="
              selectedStableIds.includes(relatedEntry.stableId)
                ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                : 'ginko:border-border'
            "
          >
            <Check
              v-if="selectedStableIds.includes(relatedEntry.stableId)"
              class="ginko:size-3.5"
            />
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
    <p v-if="relationHelpText" class="ginko:text-xs ginko:text-muted-foreground">
      {{ relationHelpText }}
    </p>
    <p v-if="fieldError" class="ginko:text-xs ginko:text-destructive">
      {{ fieldError }}
    </p>
  </div>
</template>
