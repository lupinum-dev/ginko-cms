<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import type { PublishOutcomeState } from '../../../composables/internal/useEntryPublishing'
import { collectPublicVisibilityRefreshDiagnostics } from './refreshDiagnostics'
import type { StudioPublishImpactState, StudioPublicVisibilityState } from './studioWorkflowTypes'

const props = defineProps<{
  outcome: PublishOutcomeState
  publicVisibility?: StudioPublicVisibilityState
  publishImpact: StudioPublishImpactState
}>()

const editor = useStudioEntryEditorContext()

type TrackTone = 'danger' | 'neutral' | 'success' | 'warning'

function collectionEditorT(key: string, params?: Record<string, unknown>): string {
  return editor.loader.t(`ginkoCms.studio.collectionEditor.${key}`, params)
}

function displayAddress(value: string | null | undefined, fallbackKey: string): string {
  const trimmed = value?.trim()
  return trimmed || collectionEditorT(fallbackKey)
}

const publishedLocaleSet = computed(() => new Set(props.outcome.locales))

const affectedPages = computed(() => {
  const impactRows = props.publishImpact.locales.filter((localeImpact) =>
    publishedLocaleSet.value.has(localeImpact.locale),
  )
  if (impactRows.length) {
    return impactRows.map((localeImpact) => ({
      key: localeImpact.locale,
      locale: localeImpact.locale,
      label: localeImpact.label,
      currentUrl: displayAddress(
        localeImpact.currentHref || localeImpact.currentPath,
        'publishOutcomeNotLiveYet',
      ),
      liveUrl: displayAddress(
        localeImpact.nextHref || localeImpact.nextPath,
        'publishOutcomeNoLiveUrl',
      ),
      href: localeImpact.nextHref || localeImpact.nextPath || null,
    }))
  }
  return props.outcome.locales.map((locale) => ({
    key: locale,
    locale,
    label: collectionEditorT('publishOutcomePublished'),
    currentUrl: collectionEditorT('publishOutcomeNotLiveYet'),
    liveUrl: collectionEditorT('publishOutcomeNoLiveUrl'),
    href: null,
  }))
})

const openLiveUrl = computed(() => affectedPages.value.find((row) => row.href)?.href ?? null)

const refreshDiagnostics = computed(() => {
  return collectPublicVisibilityRefreshDiagnostics({
    publicVisibility: props.publicVisibility,
    localeFilter: publishedLocaleSet.value,
  })
})

const refreshState = computed(() => {
  const first = refreshDiagnostics.value[0]
  if (first) {
    return {
      label: collectionEditorT('publishOutcomeRefreshNeedsAttention'),
      message: first.message,
      tone: (first.severity === 'warning' || first.severity === 'info'
        ? 'warning'
        : 'danger') as TrackTone,
    }
  }
  if (props.publishImpact.events.length > 0) {
    return {
      label: collectionEditorT('publishOutcomeRefreshQueued'),
      message: collectionEditorT('publishOutcomeRefreshQueuedMessage'),
      tone: 'success' as TrackTone,
    }
  }
  return {
    label: collectionEditorT('publishOutcomeRefreshNoEvent'),
    message: collectionEditorT('publishOutcomeRefreshNoEventMessage'),
    tone: 'neutral' as TrackTone,
  }
})

function refreshIconClass(tone: TrackTone) {
  if (tone === 'success') return 'ginko:text-success-fg'
  if (tone === 'warning') return 'ginko:text-warning-fg'
  if (tone === 'danger') return 'ginko:text-destructive'
  return 'ginko:text-muted-foreground'
}
</script>

<template>
  <StudioSection
    :title="collectionEditorT('publishOutcomeTitle')"
    :description="collectionEditorT('publishOutcomeDescription')"
    :badge="collectionEditorT('publishOutcomeBadge')"
  >
    <div class="ginko:grid ginko:gap-5">
      <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
        <div class="ginko:flex ginko:items-start ginko:gap-2.5">
          <CheckCircle2 class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-success-fg" />
          <div>
            <div class="ginko:text-sm ginko:font-medium ginko:text-foreground">
              {{ collectionEditorT('publishOutcomePublishedLanguages') }}
            </div>
            <div
              v-if="outcome.message"
              class="ginko:mt-0.5 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground"
            >
              {{ outcome.message }}
            </div>
            <div class="ginko:mt-2 ginko:flex ginko:flex-wrap ginko:gap-1.5">
              <Badge
                v-for="locale in outcome.locales"
                :key="`published-locale:${locale}`"
                variant="outline"
                class="ginko:font-mono ginko:text-xs"
              >
                {{ locale.toUpperCase() }}
              </Badge>
            </div>
          </div>
        </div>

        <Button v-if="openLiveUrl" as-child variant="outline" size="sm">
          <a :href="openLiveUrl" target="_blank" rel="noreferrer">
            <ExternalLink class="ginko:mr-1.5 ginko:size-3.5" />
            {{ collectionEditorT('publishOutcomeOpenLivePage') }}
          </a>
        </Button>
      </div>

      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          {{ collectionEditorT('publishOutcomeAffectedPages') }}
        </div>
        <div
          class="ginko:mt-2 ginko:divide-y ginko:divide-border/60 ginko:border-y ginko:border-border/60"
        >
          <div
            v-for="page in affectedPages"
            :key="page.key"
            class="ginko:grid ginko:gap-3 ginko:py-3 ginko:text-xs ginko:@2xl:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div class="ginko:flex ginko:items-center ginko:gap-2">
              <Badge variant="outline" class="ginko:font-mono">{{
                page.locale.toUpperCase()
              }}</Badge>
              <span class="ginko:text-muted-foreground">{{ page.label }}</span>
            </div>
            <div class="ginko:min-w-0">
              <div class="ginko:font-medium ginko:text-muted-foreground">
                {{ collectionEditorT('publishOutcomeBefore') }}
              </div>
              <div class="ginko:mt-1 ginko:truncate ginko:font-mono">{{ page.currentUrl }}</div>
            </div>
            <div class="ginko:min-w-0">
              <div class="ginko:font-medium ginko:text-muted-foreground">
                {{ collectionEditorT('publishOutcomeNowLive') }}
              </div>
              <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground">
                {{ page.liveUrl }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="ginko:border-t ginko:border-border/60 ginko:pt-4">
        <div
          class="ginko:flex ginko:items-start ginko:gap-2.5 ginko:text-sm"
          :class="refreshIconClass(refreshState.tone)"
        >
          <CheckCircle2
            v-if="refreshState.tone === 'success'"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <AlertCircle
            v-else-if="refreshState.tone === 'danger' || refreshState.tone === 'warning'"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <RefreshCw v-else class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
          <div>
            <div class="ginko:font-medium">{{ refreshState.label }}</div>
            <div class="ginko:mt-0.5 ginko:text-xs ginko:leading-5">
              {{ refreshState.message }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </StudioSection>
</template>
