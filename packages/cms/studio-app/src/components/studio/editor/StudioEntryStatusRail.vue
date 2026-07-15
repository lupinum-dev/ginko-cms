<script setup lang="ts">
import { AlertCircle, Clock, Globe, Sparkles, TriangleAlert } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import {
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
  readinessStateLabel,
} from '../../../lib/publicWorkflow'
import StudioEntryTrackCard from './StudioEntryTrackCard.vue'
import StudioWorkflowCard from './StudioWorkflowCard.vue'
import type {
  StudioEntryReadinessDetail,
  StudioPublishImpactState,
  StudioPublishReviewState,
  StudioPublicVisibilityState,
  StudioRouteValidationState,
} from './studioWorkflowTypes'
import { diagnosticLabel } from './studioWorkflowTypes'

const props = defineProps<{
  readinessDetail?: StudioEntryReadinessDetail | null
  readinessPending?: boolean
  publishImpact?: StudioPublishImpactState
  publishImpactRequested?: boolean
  publishReview?: StudioPublishReviewState
  publicVisibility?: StudioPublicVisibilityState
  requestReviewPending?: boolean
  routeValidationRequested: boolean
  routeValidationState: StudioRouteValidationState
}>()

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()

const t = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.entryDetails.${key}`, params)

const entry = computed(() => editor.loader.entry)

const readinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: props.readinessDetail,
    currentLocale: editor.loader.currentLocale,
    t: editor.loader.t,
    publishMode: 'single',
  }),
)

const localeSummaries = computed(() =>
  readinessView.value.languageRows.map((row) => ({
    label: row.label,
    status: row.status,
    blocked: row.blocked,
  })),
)

const localesAllUniform = computed(() => {
  const rows = localeSummaries.value
  if (rows.length < 2) return false
  const first = rows[0]
  return rows.every((row) => row.status === first.status && row.blocked === first.blocked)
})

const publishedLocaleCount = computed(
  () => readinessView.value.languageRows.filter((row) => row.published && !row.blocked).length,
)

// Say-it-once gating (design review S2): the six-step workflow card and the
// track card are detail surfaces — they render behind the "More details"
// toggle (the track card also surfaces on its own once the entry is live,
// because the live URL is primary information). Language machinery only
// exists when there is more than one language.
const isLive = computed(() => entry.value?.status === 'published')
const hasMultipleLocales = computed(() => localeSummaries.value.length > 1)

const blockingIssues = computed(() => {
  const issues: Array<{ key: string; message: string }> = []

  for (const row of props.readinessDetail?.locales ?? []) {
    for (const issue of row.blockers) {
      issues.push({
        key: `${row.locale}:${issue.code}:${issue.fieldPath ?? ''}`,
        message: `${row.locale.toUpperCase()}: ${readinessIssueMessage(editor.loader.t, issue)}`,
      })
    }
  }

  if (props.routeValidationRequested) {
    for (const diagnostic of props.routeValidationState.diagnostics) {
      if (diagnostic.severity === 'error') {
        issues.push({
          key: `route-${diagnostic.code}-${diagnostic.path ?? ''}`,
          message: diagnostic.message || diagnosticLabel(diagnostic.code),
        })
      }
    }
  }

  return issues.slice(0, 5)
})
</script>

<template>
  <div class="ginko:min-w-0">
    <StudioInspectorSection :title="t('status')">
      <template #icon>
        <Clock class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <template #action>
        <StudioStatusPill
          :label="
            readinessPending
              ? t('statusChecking')
              : readinessView.currentLocale
                ? readinessStateLabel(editor.loader.t, readinessView.currentLocale.state)
                : t('statusUnknown')
          "
          :tone="
            readinessView.blockers.length
              ? 'warning'
              : readinessView.currentLocale?.state === 'live' ||
                  readinessView.currentLocale?.state === 'ready'
                ? 'success'
                : entry?.status === 'published'
                  ? 'success'
                  : 'warning'
          "
          class="ginko:capitalize"
        />
      </template>
      <div v-if="entry?.publishedAt" class="ginko:space-y-3 ginko:text-sm">
        <div>
          <div class="ginko:mb-0.5 ginko:text-xs ginko:font-medium ginko:text-muted-foreground/70">
            {{ t('liveSince') }}
          </div>
          <div class="ginko:font-medium ginko:text-foreground">
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
        <div v-if="hasMultipleLocales">
          <div class="ginko:mb-1.5 ginko:text-xs ginko:font-medium ginko:text-muted-foreground/70">
            {{ t('currentLanguage') }}
          </div>
          <div
            class="ginko:font-mono ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
          >
            {{ editor.loader.currentLocale }}
          </div>
        </div>
      </div>
      <div
        v-else-if="readinessPending"
        class="ginko:mt-2 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground"
      >
        {{ t('checkingPublish') }}
      </div>
      <div v-else class="ginko:mt-2 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
        {{
          readinessView.nextAction
            ? readinessActionLabel(editor.loader.t, readinessView.nextAction.kind)
            : t('publishStatusUnknown')
        }}
      </div>
    </StudioInspectorSection>

    <StudioWorkflowCard
      v-if="advancedEditor"
      :readiness-detail="readinessDetail"
      :readiness-pending="readinessPending"
      :route-validation-requested="routeValidationRequested"
      :route-validation-state="routeValidationState"
      :publish-impact-requested="publishImpactRequested"
      :publish-impact="publishImpact"
      :publish-review="publishReview"
      :request-review-pending="requestReviewPending"
    />

    <StudioEntryTrackCard
      v-if="advancedEditor || isLive"
      :public-visibility="publicVisibility"
      :readiness-detail="readinessDetail"
      :readiness-pending="readinessPending"
    />

    <StudioInspectorSection v-if="hasMultipleLocales" :title="t('translations')">
      <template #icon>
        <Globe class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <div v-if="localeSummaries.length > 0">
        <div class="ginko:mb-4 ginko:flex ginko:items-center ginko:gap-2.5">
          <div
            class="ginko:flex ginko:size-8 ginko:items-center ginko:justify-center ginko:rounded-full ginko:bg-primary/10 ginko:text-xs ginko:font-bold ginko:text-primary ginko:ring-2 ginko:ring-primary"
          >
            {{ publishedLocaleCount }}/{{ localeSummaries.length }}
          </div>
          <span class="ginko:text-xs ginko:text-muted-foreground">
            {{
              publishedLocaleCount === localeSummaries.length
                ? t('allLanguagesUpToDate')
                : t('someLanguagesNeedWork')
            }}
          </span>
        </div>
        <!-- When everyone shares the same state, the ring already says it.
             Render a lightweight row list; otherwise show the differentiated pills. -->
        <div v-if="localesAllUniform" class="ginko:flex ginko:flex-wrap ginko:gap-1.5">
          <span
            v-for="locale in localeSummaries"
            :key="locale.label"
            class="ginko:inline-flex ginko:items-center ginko:rounded-md ginko:bg-muted/50 ginko:px-2 ginko:py-0.5 ginko:font-mono ginko:text-xs ginko:font-semibold ginko:text-muted-foreground"
          >
            {{ locale.label }}
          </span>
        </div>
        <div v-else class="ginko:space-y-0.5">
          <div
            v-for="locale in localeSummaries"
            :key="locale.label"
            class="ginko:flex ginko:items-center ginko:justify-between ginko:rounded-md ginko:px-2 ginko:py-2 ginko:transition-colors ginko:hover:bg-muted/30"
          >
            <span
              class="ginko:w-5 ginko:font-mono ginko:text-xs ginko:font-semibold ginko:text-muted-foreground/70"
            >
              {{ locale.label }}
            </span>
            <StudioStatusPill
              :label="locale.status"
              :tone="
                locale.blocked
                  ? 'warning'
                  : locale.status === 'Published' ||
                      locale.status === 'Public' ||
                      locale.status === 'Live'
                    ? 'success'
                    : 'neutral'
              "
            />
          </div>
        </div>
      </div>
      <div v-else class="ginko:text-sm ginko:text-muted-foreground">{{ t('noTranslationData') }}</div>
    </StudioInspectorSection>

    <!-- Issues only exist when there are issues (principle 5); the healthy
         state is already told by the Status pill above, and the Check-links
         action lives once, in the WORKFLOW section. -->
    <StudioInspectorSection v-if="blockingIssues.length > 0" :title="t('issues')">
      <template #icon>
        <TriangleAlert class="ginko:size-4 ginko:shrink-0 ginko:text-warning-fg" />
      </template>
      <div class="ginko:space-y-2">
        <div
          v-for="issue in blockingIssues"
          :key="issue.key"
          class="ginko:flex ginko:items-start ginko:gap-2.5 ginko:rounded-lg ginko:border ginko:border-warning/25 ginko:bg-warning/10 ginko:p-2.5"
        >
          <AlertCircle class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-warning-fg" />
          <span class="ginko:text-xs ginko:leading-relaxed ginko:text-warning-fg">
            {{ issue.message }}
          </span>
        </div>
      </div>
    </StudioInspectorSection>

    <StudioInspectorSection :title="t('moreDetails')">
      <template #icon>
        <Sparkles class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <template #action>
        <Switch
          v-model="advancedEditor"
          class="ginko:scale-90"
          :aria-label="t('toggleDetails')"
        />
      </template>
      <p class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground/80">
        {{ t('moreDetailsHint') }}
      </p>
    </StudioInspectorSection>
  </div>
</template>
