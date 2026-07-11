<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, Globe2 } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { mapEntryReadinessDetail } from '../../../lib/publicWorkflow'
import {
  collectPublicVisibilityRefreshDiagnostics,
  collectReadinessRefreshDiagnostics,
  dedupeRefreshDiagnostics,
  publicVisibilityDiagnosticsLoaded,
} from './refreshDiagnostics'
import type { StudioEntryReadinessDetail, StudioPublicVisibilityState } from './studioWorkflowTypes'

const props = defineProps<{
  publicVisibility?: StudioPublicVisibilityState
  readinessDetail?: StudioEntryReadinessDetail | null
  readinessPending?: boolean
}>()

const editor = useStudioEntryEditorContext()
type TrackTone = 'danger' | 'neutral' | 'success' | 'warning'

const entry = computed(() => {
  const value = editor.loader.entry
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
})

const readinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: props.readinessDetail,
    currentLocale: editor.loader.currentLocale,
    t: editor.loader.t,
    publishMode: 'single',
  }),
)

const visibilityRow = computed(() => {
  const rows = props.publicVisibility?.localeRows ?? []
  return (
    rows.find((row) => row.current) ??
    rows.find((row) => row.locale === editor.loader.currentLocale) ??
    rows[0] ??
    null
  )
})

const liveUrl = computed(
  () =>
    readinessView.value.publicUrl ||
    visibilityRow.value?.href ||
    visibilityRow.value?.publishedPath ||
    '',
)

const languageRows = computed(() => readinessView.value.languageRows)
const liveLanguageCount = computed(() => languageRows.value.filter((row) => row.published).length)
const changedLiveCount = computed(
  () => languageRows.value.filter((row) => row.published && row.hasUnpublishedChanges).length,
)

const trackState = computed(() => {
  if (props.readinessPending) {
    return {
      label: 'Checking live status',
      tone: 'neutral' as const,
      message: 'Checking what is live and what still needs attention.',
    }
  }
  if (!entry.value?.publishedAt && liveLanguageCount.value === 0) {
    return {
      label: 'Not live yet',
      tone: 'neutral' as const,
      message: 'Publish this entry to start tracking the live website version.',
    }
  }
  if (
    changedLiveCount.value > 0 ||
    readinessView.value.currentLocale?.state === 'live_with_changes'
  ) {
    return {
      label: 'Live with draft changes',
      tone: 'warning' as const,
      message: 'A live version exists, and the draft has changes that are not live yet.',
    }
  }
  return {
    label: 'Live now',
    tone: 'success' as const,
    message: liveUrl.value
      ? 'The current version is live on the website.'
      : 'The current version is published; no live page link is available yet.',
  }
})

const refreshDiagnostics = computed(() => {
  return dedupeRefreshDiagnostics([
    ...collectPublicVisibilityRefreshDiagnostics({ publicVisibility: props.publicVisibility }),
    ...collectReadinessRefreshDiagnostics({
      readinessDetail: props.readinessDetail,
      t: editor.loader.t,
    }),
  ])
})

const refreshDiagnosticsLoaded = computed(() =>
  publicVisibilityDiagnosticsLoaded(props.publicVisibility),
)

const refreshState = computed(() => {
  const first = refreshDiagnostics.value[0]
  if (first) {
    return {
      label: 'Website refresh needs attention',
      message: first.message,
      tone: (first.severity === 'warning' || first.severity === 'info'
        ? 'warning'
        : 'danger') as TrackTone,
    }
  }
  if (entry.value?.publishedAt || liveLanguageCount.value > 0) {
    if (!refreshDiagnosticsLoaded.value) {
      return {
        label: 'Website refresh',
        message: 'Website refresh status has not been checked yet.',
        tone: 'neutral' as TrackTone,
      }
    }
    return {
      label: 'Website refresh',
      message: 'No website refresh issues reported.',
      tone: 'success' as TrackTone,
    }
  }
  return {
    label: 'Website refresh',
    message: 'Website refresh starts after publishing.',
    tone: 'neutral' as TrackTone,
  }
})

function pillToneClass(tone: TrackTone) {
  if (tone === 'success') return 'ginko:text-success-fg'
  if (tone === 'warning') return 'ginko:text-warning-fg'
  if (tone === 'danger') return 'ginko:text-destructive'
  return 'ginko:text-muted-foreground'
}

function localeToneClass(row: {
  published: boolean
  hasUnpublishedChanges: boolean
  blocked: boolean
}) {
  if (row.blocked) return 'ginko:border-warning/30 ginko:bg-warning/10 ginko:text-warning-fg'
  if (row.published && row.hasUnpublishedChanges) {
    return 'ginko:border-warning/30 ginko:bg-warning/10 ginko:text-warning-fg'
  }
  if (row.published) return 'ginko:border-success/30 ginko:bg-success/10 ginko:text-success-fg'
  return 'ginko:border-border/60 ginko:bg-muted/40 ginko:text-muted-foreground'
}

function localeLabel(row: { published: boolean; hasUnpublishedChanges: boolean; status: string }) {
  if (row.published && row.hasUnpublishedChanges) return 'Draft changes'
  if (row.published) return 'Live'
  return row.status
}
</script>

<template>
  <StudioInspectorSection title="Track live website">
    <template #icon>
      <Globe2 class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
    </template>
    <template #action>
      <StudioStatusPill
        :label="trackState.label"
        :tone="trackState.tone"
        class="ginko:capitalize"
      />
    </template>

    <div class="ginko:space-y-4">
      <div class="ginko:flex ginko:items-start ginko:gap-2.5">
        <CheckCircle2
          v-if="trackState.tone === 'success'"
          class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-success-fg"
        />
        <AlertCircle
          v-else-if="trackState.tone === 'warning'"
          class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-warning-fg"
        />
        <Globe2
          v-else
          class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground"
        />
        <div class="ginko:min-w-0">
          <div class="ginko:text-sm ginko:font-medium ginko:text-foreground">
            {{ trackState.label }}
          </div>
          <div class="ginko:mt-0.5 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
            {{ trackState.message }}
          </div>
        </div>
      </div>

      <div v-if="entry?.publishedAt" class="ginko:text-xs">
        <div class="ginko:mb-1 ginko:font-medium ginko:text-muted-foreground">Live since</div>
        <div class="ginko:text-sm ginko:font-medium ginko:text-foreground">
          <NuxtTime
            :datetime="entry.publishedAt"
            :locale="editor.loader.dateLocale"
            month="short"
            day="numeric"
            hour="2-digit"
            minute="2-digit"
          />
        </div>
      </div>

      <div>
        <div class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          Live page
        </div>
        <a
          v-if="liveUrl"
          :href="liveUrl"
          target="_blank"
          rel="noreferrer"
          class="ginko:inline-flex ginko:max-w-full ginko:items-center ginko:gap-1 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-primary ginko:hover:underline"
        >
          <span class="ginko:truncate">{{ liveUrl }}</span>
          <ExternalLink class="ginko:size-3.5 ginko:shrink-0" />
        </a>
        <div v-else class="ginko:text-xs ginko:text-muted-foreground">No live page yet.</div>
      </div>

      <div v-if="languageRows.length">
        <div class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          Language versions
        </div>
        <div class="ginko:flex ginko:flex-wrap ginko:gap-1.5">
          <span
            v-for="row in languageRows"
            :key="row.locale"
            class="ginko:inline-flex ginko:items-center ginko:gap-1.5 ginko:rounded-md ginko:border ginko:px-2 ginko:py-1 ginko:text-xs"
            :class="localeToneClass(row)"
          >
            <span class="ginko:font-mono ginko:font-semibold">{{ row.label }}</span>
            <span>{{ localeLabel(row) }}</span>
          </span>
        </div>
      </div>

      <div class="ginko:border-t ginko:border-border/60 ginko:pt-3">
        <div
          class="ginko:flex ginko:items-start ginko:gap-2.5 ginko:text-xs"
          :class="pillToneClass(refreshState.tone)"
        >
          <CheckCircle2
            v-if="refreshState.tone === 'success'"
            class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0"
          />
          <AlertCircle v-else class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0" />
          <div>
            <div class="ginko:font-medium">{{ refreshState.label }}</div>
            <div class="ginko:mt-0.5 ginko:leading-5">{{ refreshState.message }}</div>
          </div>
        </div>
      </div>
    </div>
  </StudioInspectorSection>
</template>
