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
const t = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.entryDetails.${key}`, params)
type TrackTone = 'danger' | 'neutral' | 'success' | 'warning'

const entry = computed(() => editor.loader.entry)

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
      label: t('trackChecking'),
      tone: 'neutral' as const,
      message: t('trackCheckingMessage'),
    }
  }
  if (!entry.value?.publishedAt && liveLanguageCount.value === 0) {
    return {
      label: t('trackNotLive'),
      tone: 'neutral' as const,
      message: t('trackNotLiveMessage'),
    }
  }
  if (
    changedLiveCount.value > 0 ||
    readinessView.value.currentLocale?.state === 'live_with_changes'
  ) {
    return {
      label: t('trackLiveWithChanges'),
      tone: 'warning' as const,
      message: t('trackLiveWithChangesMessage'),
    }
  }
  return {
    label: t('trackLiveNow'),
    tone: 'success' as const,
    message: liveUrl.value ? t('trackLiveNowMessage') : t('trackLiveNowNoLink'),
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
      label: t('trackRefreshNeedsAttention'),
      message: first.message,
      tone: (first.severity === 'warning' || first.severity === 'info'
        ? 'warning'
        : 'danger') as TrackTone,
    }
  }
  if (entry.value?.publishedAt || liveLanguageCount.value > 0) {
    if (!refreshDiagnosticsLoaded.value) {
      return {
        label: t('trackRefresh'),
        message: t('trackRefreshUnchecked'),
        tone: 'neutral' as TrackTone,
      }
    }
    return {
      label: t('trackRefresh'),
      message: t('trackRefreshHealthy'),
      tone: 'success' as TrackTone,
    }
  }
  return {
    label: t('trackRefresh'),
    message: t('trackRefreshAfterPublish'),
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
  if (row.blocked)
    return 'ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
  if (row.published && row.hasUnpublishedChanges) {
    return 'ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
  }
  if (row.published)
    return 'ginko:border-success/30 ginko:bg-success/10 ginko:dark:bg-success/15 ginko:text-success-fg'
  return 'ginko:border-border/60 ginko:bg-muted/40 ginko:text-muted-foreground'
}

function localeLabel(row: { published: boolean; hasUnpublishedChanges: boolean; status: string }) {
  if (row.published && row.hasUnpublishedChanges) return t('stepDraftChanges')
  if (row.published) return t('statusLive')
  return row.status
}
</script>

<template>
  <StudioInspectorSection :title="t('trackLiveWebsite')">
    <template #icon>
      <Globe2 class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
    </template>
    <div class="ginko:space-y-4">
      <!-- No status pill here: the Status section above already names the
           state (say it once). This card adds the live-tracking explanation,
           URL, and per-language deltas. -->
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
        <div class="ginko:min-w-0 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
          {{ trackState.message }}
        </div>
      </div>

      <!-- "Live since" already renders in the Status section above. -->
      <div>
        <div class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          {{ t('livePage') }}
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
        <div v-else class="ginko:text-xs ginko:text-muted-foreground">{{ t('noLivePage') }}</div>
      </div>

      <div v-if="languageRows.length">
        <div class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          {{ t('languageVersions') }}
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
