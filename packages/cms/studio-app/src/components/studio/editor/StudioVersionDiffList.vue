<script setup lang="ts">
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { fieldDisplayLabel, humanizeFieldKey } from '../../../lib/fieldLabel'

const editor = useStudioEntryEditorContext()
const ce = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.collectionEditor.${key}`, params)

type DiffChange = { field: string; left: unknown; right: unknown }

const changes = computed<DiffChange[]>(() => editor.history.versionDiff?.changes ?? [])

function localeLabel(code: string) {
  const match = editor.loader.locales?.find((locale: { code: string; label?: string }) => {
    return locale.code === code
  })
  return match?.label ?? code.toUpperCase()
}

function fieldLabelByKey(key: string): string {
  const field = editor.loader.fields?.find(
    (candidate: { key: string; label?: unknown }) => candidate.key === key,
  )
  return field ? fieldDisplayLabel(field) : humanizeFieldKey(key)
}

const multiLocale = computed(() => (editor.loader.locales?.length ?? 0) > 1)

// Flattened snapshot paths (shared.*, locale.<code>.*) become writer-facing
// labels; raw paths stay available in the developer details below.
function changeLabel(change: DiffChange): string {
  const path = change.field
  if (path === 'shared.baseSlug') return ce('urlSlugLabel')
  if (path === 'shared.parentEntryId') return ce('versionDiffParent')
  if (path === 'shared.orderRank') return ce('versionDiffOrder')
  const shared = /^shared\.(.+)$/.exec(path)
  if (shared) return fieldLabelByKey(shared[1])
  const locale = /^locale\.([^.]+)(?:\.(.+))?$/.exec(path)
  if (locale) {
    const code = locale[1]
    const rest = locale[2]
    if (!rest) return localeLabel(code)
    const suffix = multiLocale.value ? ` · ${localeLabel(code)}` : ''
    if (rest === 'slug') return `${ce('urlSlugLabel')}${suffix}`
    if (rest === 'path') return `${ce('publishDialogPageAddress')}${suffix}`
    const values = /^values\.(.+)$/.exec(rest)
    if (values) return `${fieldLabelByKey(values[1])}${suffix}`
    return `${humanizeFieldKey(rest)}${suffix}`
  }
  return humanizeFieldKey(path)
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

// Temporal reading: left is the selected (older) version, right is the
// current version — "Added" means the field gained content since then.
function changeKindLabel(change: DiffChange): string {
  if (isEmptyValue(change.left) && !isEmptyValue(change.right)) return ce('diffAdded')
  if (!isEmptyValue(change.left) && isEmptyValue(change.right)) return ce('diffRemoved')
  return ce('diffChanged')
}

function previewValue(value: unknown): string {
  if (isEmptyValue(value)) return '—'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed
}
</script>

<template>
  <div
    class="ginko:mt-3 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
  >
    <p class="ginko:text-xs ginko:font-medium ginko:text-foreground">
      {{ ce('versionDiffTitle') }}
    </p>
    <p
      v-if="editor.history.versionDiffPending"
      class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground"
    >
      {{ ce('versionDiffLoading') }}
    </p>
    <p
      v-else-if="changes.length === 0"
      class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground"
    >
      {{ ce('noDiffChanges') }}
    </p>
    <template v-else>
      <ul class="ginko:mt-2 ginko:grid ginko:gap-2.5" role="list">
        <li v-for="change in changes" :key="change.field" class="ginko:grid ginko:gap-1">
          <div class="ginko:flex ginko:items-center ginko:gap-2">
            <span class="ginko:text-xs ginko:font-medium ginko:text-foreground">
              {{ changeLabel(change) }}
            </span>
            <Badge variant="outline" class="ginko:text-xs">
              {{ changeKindLabel(change) }}
            </Badge>
          </div>
          <dl class="ginko:grid ginko:gap-0.5 ginko:text-xs ginko:text-muted-foreground">
            <div class="ginko:flex ginko:gap-1.5">
              <dt class="ginko:shrink-0 ginko:font-medium">{{ ce('diffOldValue') }}:</dt>
              <dd class="ginko:min-w-0 ginko:break-words">{{ previewValue(change.left) }}</dd>
            </div>
            <div class="ginko:flex ginko:gap-1.5">
              <dt class="ginko:shrink-0 ginko:font-medium">{{ ce('diffNewValue') }}:</dt>
              <dd class="ginko:min-w-0 ginko:break-words">{{ previewValue(change.right) }}</dd>
            </div>
          </dl>
        </li>
      </ul>
      <StudioDeveloperDetails class="ginko:mt-3" :framed="false">
        <pre
          class="ginko:overflow-x-auto ginko:whitespace-pre-wrap ginko:break-all ginko:font-mono ginko:text-xs"
          >{{ JSON.stringify(changes, null, 2) }}</pre
        >
      </StudioDeveloperDetails>
    </template>
  </div>
</template>
