<script setup lang="ts">
import { Check, ChevronsUpDown, Loader2, Search } from '@lucide/vue'
import { ListboxFilter } from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { api } from '../../../boundary/api'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useCmsStudioPaginatedQuery } from '../../../composables/useCmsStudioPaginatedQuery'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'

type ParentCandidate = {
  _id: string
  title: string
  path: string
}

const props = defineProps<{
  collection: string
  locale: string
  modelValue: string
  disabled?: boolean
  excludeEntryId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: { id: string; path: string } | null]
}>()

const { t } = useCmsI18n()
const open = ref(false)
const search = ref('')
const query = computed(() => search.value.trim())
const candidateArgs = computed(() => ({
  collection: props.collection,
  locale: props.locale,
  parentEntryId: null,
  ...(query.value ? { query: query.value } : {}),
}))
const candidatesQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listEntriesForStudio,
  candidateArgs,
  { initialNumItems: 30, keepPreviousData: true },
)
const candidateStatus = candidatesQuery.status
const hasMoreCandidates = candidatesQuery.canLoadMore
const selectedQuery = useCmsStudioQuery(
  api.ginkoCms.editor.getEntry,
  computed(() =>
    props.modelValue ? { id: props.modelValue, locale: props.locale } : ('skip' as const),
  ),
)

function asCandidate(value: unknown): ParentCandidate | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row._id !== 'string' || typeof row.path !== 'string') return null
  return {
    _id: row._id,
    title:
      typeof row.title === 'string' && row.title.trim()
        ? row.title
        : typeof row.baseSlug === 'string'
          ? row.baseSlug
          : row._id,
    path: row.path,
  }
}

const selected = computed(() => asCandidate(selectedQuery.data.value))
const candidates = computed(() => {
  const rows = (candidatesQuery.data.value ?? [])
    .map(asCandidate)
    .filter((row): row is ParentCandidate => row !== null)
  const current = selected.value
  if (current && !rows.some((row) => row._id === current._id)) rows.unshift(current)
  return rows
})

watch(
  selected,
  (value) => {
    if (value) emit('select', { id: value._id, path: value.path })
  },
  { immediate: true },
)

function choose(candidate: ParentCandidate | null) {
  emit('update:modelValue', candidate?._id ?? '')
  emit('select', candidate ? { id: candidate._id, path: candidate.path } : null)
  search.value = ''
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :aria-label="t('ginkoCms.studio.collectionEditor.parent')"
        :aria-expanded="open"
        :disabled="disabled"
        class="ginko:h-9 ginko:w-full ginko:justify-between ginko:gap-2 ginko:px-3 ginko:font-normal"
      >
        <span v-if="selected" class="ginko:min-w-0 ginko:text-left">
          <span class="ginko:block ginko:truncate">{{ selected.title }}</span>
          <span
            class="ginko:block ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            {{ selected.path }}
          </span>
        </span>
        <span v-else class="ginko:truncate ginko:text-muted-foreground">
          {{ t('ginkoCms.common.noneRoot') }}
        </span>
        <ChevronsUpDown class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="ginko:w-[min(28rem,var(--reka-popover-trigger-width))] ginko:p-0"
    >
      <Command>
        <div class="ginko:flex ginko:h-11 ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3">
          <Search class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
          <ListboxFilter
            v-model="search"
            auto-focus
            :placeholder="t('ginkoCms.studio.fieldRenderer.searchEntries')"
            class="ginko:h-10 ginko:w-full ginko:bg-transparent ginko:text-sm ginko:outline-hidden"
          />
        </div>
        <CommandList class="ginko:max-h-72">
          <CommandGroup>
            <CommandItem value="__ginko_root__" @select="choose(null)">
              <span class="ginko:grid ginko:size-5 ginko:place-items-center">
                <Check v-if="!modelValue" class="ginko:size-4" />
              </span>
              {{ t('ginkoCms.common.noneRoot') }}
            </CommandItem>
            <CommandItem
              v-for="candidate in candidates"
              :key="candidate._id"
              :value="candidate._id"
              :disabled="candidate._id === excludeEntryId"
              @select="choose(candidate)"
            >
              <span class="ginko:grid ginko:size-5 ginko:shrink-0 ginko:place-items-center">
                <Check v-if="candidate._id === modelValue" class="ginko:size-4" />
              </span>
              <span class="ginko:min-w-0 ginko:flex-1">
                <span class="ginko:block ginko:truncate ginko:font-medium">{{
                  candidate.title
                }}</span>
                <span
                  class="ginko:block ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
                >
                  {{ candidate.path }}
                </span>
              </span>
            </CommandItem>
          </CommandGroup>
          <div
            v-if="candidateStatus === 'loading-first-page'"
            class="ginko:flex ginko:items-center ginko:justify-center ginko:gap-2 ginko:px-3 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
          >
            <Loader2 class="ginko:size-4 ginko:animate-spin" />
            {{ t('ginkoCms.studio.commandPalette.searching') }}
          </div>
          <CommandEmpty v-else>
            {{ t('ginkoCms.studio.commandPalette.noResults') }}
          </CommandEmpty>
          <div
            v-if="hasMoreCandidates"
            class="ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
          >
            {{ t('ginkoCms.studio.fieldRenderer.keepTypingToNarrow') }}
          </div>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
