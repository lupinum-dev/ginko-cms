<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Link2,
  Sparkles,
  TriangleAlert,
} from 'lucide-vue-next'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import type {
  StudioPublicVisibilityState,
  StudioPublishImpactState,
  StudioPublishReviewState,
  StudioRouteValidationState,
  StudioTranslationReadinessRow,
} from './studioWorkflowTypes'
import { diagnosticLabel } from './studioWorkflowTypes'

const props = defineProps<{
  publicVisibility: StudioPublicVisibilityState
  publishImpact: StudioPublishImpactState
  publishImpactRequested: boolean
  publishReview: StudioPublishReviewState
  previewScope: 'publish' | 'workflow' | null
  routeValidationRequested: boolean
  routeValidationState: StudioRouteValidationState
  selectedPublishImpactLocale: string | null
  translationReadiness: StudioTranslationReadinessRow[]
}>()

const emit = defineEmits<{
  previewPublishImpact: []
  validatePublicRoutes: []
  reviewTranslationReadiness: [locale: string]
}>()

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()

const entry = computed(() => {
  const value = editor.loader.entry
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
})

const currentRoute = computed(
  () =>
    props.publicVisibility.localeRows.find((row) => row.current) ??
    props.publicVisibility.localeRows.find((row) => row.locale === editor.loader.currentLocale) ??
    null,
)

const publicUrl = computed(
  () =>
    currentRoute.value?.href ||
    currentRoute.value?.publishedPath ||
    currentRoute.value?.path ||
    editor.draft.computedPath ||
    '',
)

const localeSummaries = computed(() =>
  props.publicVisibility.localeRows.map((row) => ({
    label: row.locale.toUpperCase(),
    status: row.label || (row.publishedState === 'published' ? 'Published' : 'Draft'),
    blocked:
      row.missingRequiredFields.length > 0 ||
      row.visibleDiagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  })),
)

const localesAllUniform = computed(() => {
  const rows = localeSummaries.value
  if (rows.length < 2) return false
  const first = rows[0]
  return rows.every((row) => row.status === first.status && row.blocked === first.blocked)
})

const publishedLocaleCount = computed(
  () => localeSummaries.value.filter((row) => !row.blocked && row.status !== 'Draft').length,
)

const blockingIssues = computed(() => {
  const issues: Array<{ key: string; message: string }> = []

  for (const diagnostic of props.publicVisibility.globalDiagnostics) {
    if (diagnostic.severity === 'error') {
      issues.push({
        key: `global-${diagnostic.code}-${diagnostic.path ?? ''}`,
        message: diagnostic.message || diagnosticLabel(diagnostic.code),
      })
    }
  }

  for (const row of props.publicVisibility.localeRows) {
    for (const field of row.missingRequiredFields) {
      issues.push({
        key: `${row.locale}-missing-${field}`,
        message: `${row.locale.toUpperCase()} is missing ${field}.`,
      })
    }
    for (const diagnostic of row.visibleDiagnostics) {
      if (diagnostic.severity === 'error') {
        issues.push({
          key: `${row.locale}-${diagnostic.code}-${diagnostic.path ?? ''}`,
          message: `${row.locale.toUpperCase()}: ${diagnostic.message || diagnosticLabel(diagnostic.code)}`,
        })
      }
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

  for (const row of props.translationReadiness) {
    if (row.parentBlocked || row.missingRoute) {
      issues.push({
        key: `readiness-${row.locale}-route`,
        message: `${row.label} needs a public route before publishing.`,
      })
    }
    if (row.missingFields.length > 0) {
      issues.push({
        key: `readiness-${row.locale}-fields`,
        message: `${row.label} is missing ${row.missingFields.length} required field${
          row.missingFields.length === 1 ? '' : 's'
        }.`,
      })
    }
  }

  return issues.slice(0, 5)
})
</script>

<template>
  <div class="ginko:min-w-0">
    <StudioInspectorSection title="Status">
      <template #icon>
        <Clock class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <template #action>
        <StudioStatusPill
          :label="entry?.status ?? 'draft'"
          :tone="entry?.status === 'published' ? 'success' : 'warning'"
          class="ginko:capitalize"
        />
      </template>
      <div v-if="entry?.publishedAt" class="ginko:space-y-3 ginko:text-sm">
        <div>
          <div class="ginko:mb-0.5 ginko:text-xs ginko:font-medium ginko:text-muted-foreground/70">
            Published at
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
        <div>
          <div class="ginko:mb-1.5 ginko:text-xs ginko:font-medium ginko:text-muted-foreground/70">
            Current locale
          </div>
          <div
            class="ginko:font-mono ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
          >
            {{ editor.loader.currentLocale }}
          </div>
        </div>
      </div>
      <div v-else class="ginko:mt-2 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
        Not published yet.
      </div>
    </StudioInspectorSection>

    <StudioInspectorSection title="Public URL">
      <template #icon>
        <Link2 class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <a
        v-if="publicUrl"
        :href="publicUrl"
        target="_blank"
        rel="noreferrer"
        class="ginko:mb-3 ginko:inline-flex ginko:items-center ginko:gap-1 ginko:break-all ginko:text-sm ginko:leading-relaxed ginko:text-primary ginko:hover:underline"
      >
        {{ publicUrl }}
      </a>
      <div v-else class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-muted-foreground">
        No public URL yet
      </div>
      <Button
        v-if="publicUrl"
        variant="outline"
        size="sm"
        as-child
        class="ginko:mt-4 ginko:w-full ginko:gap-2"
      >
        <a :href="publicUrl" target="_blank" rel="noreferrer">
          <ExternalLink class="ginko:size-4" />
          Open page
        </a>
      </Button>
    </StudioInspectorSection>

    <StudioInspectorSection title="Translations">
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
                ? 'All locales up to date'
                : 'Some locales need attention'
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
                  : locale.status === 'Published' || locale.status === 'Public'
                    ? 'success'
                    : 'neutral'
              "
            />
          </div>
        </div>
      </div>
      <div v-else class="ginko:text-sm ginko:text-muted-foreground">No translation data yet.</div>
    </StudioInspectorSection>

    <StudioInspectorSection title="Issues">
      <template #icon>
        <TriangleAlert
          class="ginko:size-4 ginko:shrink-0"
          :class="blockingIssues.length > 0 ? 'text-warning-fg' : 'text-muted-foreground/70'"
        />
      </template>
      <div
        v-if="blockingIssues.length === 0"
        class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-sm"
      >
        <CheckCircle2 class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-success-fg" />
        <div>
          <div class="ginko:font-medium">No blocking issues</div>
          <div class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground/80">
            This draft can move forward.
          </div>
        </div>
      </div>
      <div v-else class="ginko:space-y-2">
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
        <Button
          v-if="publicVisibility.isRouteBacked"
          variant="outline"
          size="sm"
          class="ginko:mt-2 ginko:w-full ginko:border-border/60 ginko:text-xs ginko:font-medium ginko:hover:bg-muted/30"
          @click="emit('validatePublicRoutes')"
        >
          Check links
        </Button>
      </div>
    </StudioInspectorSection>

    <StudioInspectorSection title="Advanced diagnostics">
      <template #icon>
        <Sparkles class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70" />
      </template>
      <template #action>
        <Switch
          v-model:checked="advancedEditor"
          class="ginko:scale-90"
          aria-label="Toggle advanced editor diagnostics"
        />
      </template>
      <p class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground/80">
        Routes, readiness, and version history. Hidden by default.
      </p>
    </StudioInspectorSection>

    <template v-if="advancedEditor">
      <StudioRouteStatusCard
        :public-visibility="publicVisibility"
        :route-validation-requested="routeValidationRequested"
        :route-validation-state="routeValidationState"
        @validate-public-routes="emit('validatePublicRoutes')"
      />
      <StudioTranslationReadinessCard
        :items="translationReadiness"
        @review="emit('reviewTranslationReadiness', $event)"
      />
      <StudioWorkflowCard />
      <StudioVersionHistoryCard />
    </template>
  </div>
</template>
