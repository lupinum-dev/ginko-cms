<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { AlertCircle } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import type {
  StudioEntryReadinessDetail,
  StudioReadinessLocale,
} from '../../components/studio/editor/studioWorkflowTypes'
import { provideStudioEntryEditorContext } from '../../composables/internal/studioEntryEditorContext'
import { useStudioEntryEditor } from '../../composables/internal/useStudioEntryEditor'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useStudioAdvancedEditor } from '../../composables/useStudioAdvancedEditor'
import {
  derivePublishOperationPreviewState,
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
  readinessStateLabel,
} from '../../lib/publicWorkflow'
const studioHost = useStudioHostContext()
const editor = useStudioEntryEditor()
provideStudioEntryEditorContext(editor)
const advancedEditor = useStudioAdvancedEditor()

const IMPACT_STATUS_LABELS: Record<string, string> = {
  ready: 'Website changes ready',
  blocked: 'Blocked',
  no_changes: 'No public changes',
  not_publishable: 'Not publishable',
}
const MAX_DIAGNOSTICS_PER_LOCALE = 3

const isRouteBackedEntry = computed(
  () =>
    editor.loader.collectionConfig?.mode !== 'none' &&
    editor.loader.collectionConfig?.routing?.mode !== 'none',
)

const routeValidationRequested = ref(false)
const publishImpactRequested = ref(false)
const selectedPublishImpactLocale = ref<string | null>(null)
const publishImpactStale = ref(false)
const requestReviewPending = ref(false)

const visibilityQuery = useCmsStudioQuery(
  api.ginkoCms.diagnostics.explainPublicVisibility,
  computed(() =>
    advancedEditor.value || routeValidationRequested.value
      ? {
          collection: editor.loader.collection,
          entryId: editor.loader.entryId,
        }
      : null,
  ),
  { keepPreviousData: true },
)
const readinessDetailQuery = useCmsStudioQuery(
  api.ginkoCms.editor.getEntryReadinessSummary,
  computed(() => ({ entryId: editor.loader.entryId })),
  { keepPreviousData: true },
)
const publishOperationPreview = ref<{
  allowed: boolean
  summary: string
  blockers: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  effects: Array<{ kind: string; summary: string; count?: number }>
  details?: { locales?: unknown[]; changes?: unknown[]; events?: unknown[] }
  confirm?: unknown
  confirmation?: { token: string; expiresAt: number }
} | null>(null)
const routeValidationQuery = useCmsStudioQuery(
  api.ginkoCms.diagnostics.validatePublicRoutes,
  computed(() => (routeValidationRequested.value ? {} : null)),
  { keepPreviousData: true },
)
const entryScopeKey = computed(() => `${editor.loader.collection}:${editor.loader.entryId}`)
watch(entryScopeKey, () => {
  routeValidationRequested.value = false
  publishImpactRequested.value = false
  selectedPublishImpactLocale.value = null
  publishImpactStale.value = false
  requestReviewPending.value = false
  publishOperationPreview.value = null
})

const readinessDetail = computed(() => {
  const detail = readinessDetailQuery.data.value
  return detail && typeof detail === 'object' ? (detail as StudioEntryReadinessDetail) : null
})

const currentReadinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: readinessDetail.value,
    currentLocale: getCurrentLocale(),
    t: editor.loader.t,
    publishMode: 'single',
  }),
)

function getCurrentLocale() {
  return typeof editor.loader.currentLocale === 'string'
    ? editor.loader.currentLocale
    : editor.loader.currentLocale.value
}

function visibilityStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    public: 'Live',
    draft_only: 'Draft only',
    missing_route: 'Missing URL',
    missing_required_fields: 'Missing required fields',
    parent_not_public: 'Parent not live',
    collision: 'URL conflict',
    excluded: 'Not live',
  }
  return labels[status ?? ''] ?? 'Not live'
}

function impactStatusLabel(status: string | null | undefined) {
  return IMPACT_STATUS_LABELS[status ?? ''] ?? 'Unknown'
}

function queryErrorMessage(error: Error | null | undefined, fallback: string) {
  return error?.message ? `${fallback} ${error.message}` : fallback
}

function stablePreviewHash(value: unknown) {
  const payload = JSON.stringify(value)
  let hash = 5381
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 33) ^ payload.charCodeAt(index)
  }
  return `operation:${(hash >>> 0).toString(36)}:${payload.length.toString(36)}`
}

function convexClient() {
  return studioHost.requireConvexClient()
}

function findLocaleVariant(locale: string) {
  return editor.loader.localeVariants.find(
    (variant: {
      locale: string
      draftPath?: string | null
      publishedPath?: string | null
      published?: boolean
      updatedAt?: number | null
    }) => variant.locale === locale,
  )
}

function findReadinessLocale(locale: string) {
  return readinessDetail.value?.locales.find((item) => item.locale === locale) ?? null
}

function readinessIssueMessages(localeReadiness: StudioReadinessLocale | null) {
  return (
    localeReadiness?.blockers.map((issue) => readinessIssueMessage(editor.loader.t, issue)) ?? []
  )
}

const publicVisibility = computed(() => {
  const explanation = visibilityQuery.data.value
  const currentLocale = getCurrentLocale()
  const diagnostics = explanation?.diagnostics ?? []
  const globalDiagnostics = diagnostics.filter(
    (diagnostic: { locale: string | null }) => !diagnostic.locale,
  )
  const localeRows =
    explanation?.locales.map(
      (localeState: {
        locale: string
        status: string
        path: string | null
        href: string | null
        sitemap: string
        search: string
        nav: string
        reasons: string[]
        missingRequiredFields: string[]
        secondaryStatuses?: string[]
      }) => {
        const rowDiagnostics = diagnostics.filter(
          (diagnostic: { locale: string | null }) => diagnostic.locale === localeState.locale,
        )
        const variant = findLocaleVariant(localeState.locale)
        const isPublic = localeState.status === 'public'
        return {
          ...localeState,
          current: localeState.locale === currentLocale,
          draftState: variant ? 'Draft exists' : isPublic ? 'No draft changes' : 'Missing draft',
          publishedState: variant?.published || isPublic ? 'Live' : 'Not live',
          draftPath: variant?.draftPath ?? null,
          publishedPath: variant?.publishedPath ?? null,
          label: visibilityStatusLabel(localeState.status),
          diagnostics: rowDiagnostics,
          visibleDiagnostics: rowDiagnostics.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
          hiddenDiagnosticCount: Math.max(rowDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
          secondaryLabels: (localeState.secondaryStatuses ?? []).map(visibilityStatusLabel),
        }
      },
    ) ?? []
  const isRouteBacked = explanation ? explanation.mode === 'route' : true
  const publicLocales =
    explanation?.locales.filter((item: { status: string }) => item.status === 'public') ?? []

  return {
    isRouteBacked,
    status: visibilityQuery.pending.value
      ? 'Loading'
      : visibilityQuery.error.value
        ? 'Diagnostics failed'
        : !explanation
          ? 'Live status unknown'
          : !isRouteBacked
            ? 'Shared data'
            : 'Live status by language',
    localeRows,
    globalDiagnostics,
    hiddenGlobalDiagnosticCount: Math.max(globalDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
    publishedLocales: publicLocales.map((item: { locale: string }) => item.locale),
    pending: visibilityQuery.pending.value,
    error: visibilityQuery.error.value,
    errorMessage: queryErrorMessage(
      visibilityQuery.error.value,
      'Live website status could not be loaded.',
    ),
  }
})

const routeValidationState = computed(() => {
  if (!routeValidationRequested.value) {
    return { state: 'idle', message: '', diagnostics: [], hiddenDiagnosticCount: 0 }
  }
  if (routeValidationQuery.pending.value) {
    return {
      state: 'pending',
      message: 'Checking website URLs...',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  if (routeValidationQuery.error.value) {
    return {
      state: 'error',
      message: queryErrorMessage(routeValidationQuery.error.value, 'URL check failed.'),
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  const data = routeValidationQuery.data.value
  if (!Array.isArray(data)) {
    return {
      state: 'missing',
      message: 'URL check returned no usable result.',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  if (data.length === 0) {
    return {
      state: 'empty',
      message: 'Website URL check: no issues.',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  return {
    state: 'found',
    message: `Website URL check: ${data.length} issue${data.length === 1 ? '' : 's'}.`,
    diagnostics: data.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
    hiddenDiagnosticCount: Math.max(data.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
  }
})

const publishImpact = computed(() => {
  if (!publishImpactRequested.value) {
    return {
      state: 'idle',
      message: '',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: null,
    }
  }
  if (publishImpactStale.value) {
    return {
      state: 'stale',
      message: 'This draft changed since the preview. Preview website changes again.',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: null,
    }
  }
  const preview = publishOperationPreview.value
  if (!preview) {
    return {
      state: 'missing',
      message: 'We could not prepare the website preview. Try again.',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: null,
    }
  }
  const blocked = preview.allowed === false || preview.blockers.length > 0
  const warning = preview.warnings[0]?.message
  const detailsLocales = Array.isArray(preview.details?.locales)
    ? preview.details.locales
    : editor.publishing.publishReadiness.locales.map((locale: string) => ({
        locale,
        status: blocked ? 'blocked' : 'ready',
        currentHref: null,
        nextHref: null,
        currentPath: null,
        nextPath: null,
        sitemap: { before: false, after: true },
        search: { before: false, after: true },
        nav: { before: false, after: true },
        changes: [],
        blockingDiagnostics: [],
        warnings: warning
          ? [
              {
                code: 'publish_preview_warning',
                severity: 'warning',
                message: warning,
              },
            ]
          : [],
      }))
  return {
    state: blocked ? 'blocked' : 'ready',
    message:
      preview.blockers[0]?.message ?? warning ?? preview.summary ?? 'Publish preview is ready.',
    cacheTags: [],
    events: Array.isArray(preview.details?.events) ? preview.details.events.map(String) : [],
    locales: detailsLocales.map((localeState) => {
      const locale = localeState as {
        locale: string
        status?: string
        blockingDiagnostics?: Array<{ code: string; severity?: string; message: string }>
        warnings?: Array<{ code: string; severity?: string; message: string }>
      } & Record<string, unknown>
      const blockers = locale.blockingDiagnostics ?? []
      const warnings = locale.warnings ?? []
      return {
        ...locale,
        label: impactStatusLabel(locale.status),
        visibleBlockers: blockers.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
        hiddenBlockerCount: Math.max(blockers.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
        visibleWarnings: warnings.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
      }
    }),
    status: blocked ? 'blocked' : 'ready',
    pending: false,
    error: null,
  }
})

const translationReadiness = computed(() =>
  editor.loader.locales
    .filter((locale: { code: string; label?: string }) => locale.code !== getCurrentLocale())
    .map((locale: { code: string; label?: string }) => {
      const localeReadiness = findReadinessLocale(locale.code)
      const variant = findLocaleVariant(locale.code)
      const blockers = localeReadiness?.blockers ?? []
      const missingFields = blockers
        .filter((issue) =>
          [
            'required_field_missing',
            'required_localized_field_missing',
            'required_shared_field_missing',
            'data_only_required_field_missing',
          ].includes(issue.code),
        )
        .map((issue) => issue.fieldPath)
        .filter((field): field is string => !!field)
      const missingRoute = blockers.some((issue) =>
        ['route_missing', 'locale_public_route_missing', 'locale_slug_missing'].includes(
          issue.code,
        ),
      )
      const parentBlocked = blockers.some((issue) =>
        ['route_parent_not_public', 'locale_parent_missing'].includes(issue.code),
      )

      return {
        locale: locale.code,
        label: locale.label || locale.code,
        exists: localeReadiness?.draftExists ?? !!variant,
        published: localeReadiness?.published ?? !!variant?.published,
        draftPath: localeReadiness?.draftUrl ?? variant?.draftPath ?? null,
        status: readinessDetailQuery.pending.value
          ? 'Checking publish status'
          : localeReadiness
            ? readinessStateLabel(editor.loader.t, localeReadiness.state)
            : 'Publish status unknown',
        missingFields,
        missingRoute,
        parentBlocked,
        impactLabel: localeReadiness
          ? readinessStateLabel(editor.loader.t, localeReadiness.state)
          : 'Unknown',
        suggestedAction: localeReadiness
          ? readinessActionLabel(editor.loader.t, localeReadiness.nextAction.kind)
          : 'Refresh publish status before translating.',
      }
    }),
)

const primaryLocaleStatus = computed(() =>
  currentReadinessView.value.currentLocale
    ? readinessStateLabel(editor.loader.t, currentReadinessView.value.currentLocale.state)
    : undefined,
)

const secondaryLocaleReadiness = computed(() =>
  editor.locales.secondaryLocale
    ? (readinessDetail.value?.locales.find(
        (row) => row.locale === editor.locales.secondaryLocale,
      ) ?? null)
    : null,
)

const secondaryLocaleStatus = computed(() =>
  secondaryLocaleReadiness.value
    ? readinessStateLabel(editor.loader.t, secondaryLocaleReadiness.value.state)
    : undefined,
)

const secondaryLocaleMissingFields = computed(() =>
  (secondaryLocaleReadiness.value?.blockers ?? [])
    .filter((issue) =>
      [
        'required_field_missing',
        'required_localized_field_missing',
        'required_shared_field_missing',
        'data_only_required_field_missing',
      ].includes(issue.code),
    )
    .map((issue) => issue.fieldPath)
    .filter((field): field is string => Boolean(field)),
)

const isCompareMode = computed(
  () => editor.locales.translationMode && Boolean(editor.locales.secondaryLocale),
)

const publishReview = computed(() => {
  const readiness = editor.publishing.publishReadiness
  const currentReadiness = findReadinessLocale(editor.loader.currentLocale)
  return {
    blocked: readiness.state === 'blocked',
    failed: readiness.state === 'failed',
    label:
      readiness.state === 'ready'
        ? readinessStateLabel(editor.loader.t, currentReadiness?.state ?? 'ready')
        : readiness.state,
    locales: readiness.locales,
    message:
      readiness.message ||
      readinessIssueMessages(currentReadiness)[0] ||
      readinessActionLabel(editor.loader.t, currentReadiness?.nextAction.kind),
    previewHash: readiness.previewHash,
    stale: readiness.state === 'stale',
    state: readiness.state,
  }
})

watch(
  () => editor.draft.isDirty,
  (dirty) => {
    if (dirty) {
      publishOperationPreview.value = null
      editor.publishing.markPublishReadinessStale()
      if (publishImpactRequested.value) publishImpactStale.value = true
    }
  },
)

watch(
  () => [editor.loader.currentLocale, editor.publishing.publishMode],
  () => {
    publishOperationPreview.value = null
    editor.publishing.markPublishReadinessStale('Publish scope changed after the last preview.')
    if (publishImpactRequested.value) publishImpactStale.value = true
  },
)

async function validatePublicRoutes() {
  if (!isRouteBackedEntry.value) return
  routeValidationRequested.value = true
  await routeValidationQuery.refresh()
}

async function previewPublishImpact(locale?: string, options: { saveDraft?: boolean } = {}) {
  selectedPublishImpactLocale.value = locale ?? null
  publishImpactStale.value = false
  editor.publishing.setPublishReadiness({
    state: 'pending',
    message:
      options.saveDraft === false
        ? 'Previewing website changes...'
        : 'Saving draft and previewing website changes...',
    previewHash: null,
    locales: [],
  })
  if (options.saveDraft !== false && editor.draft.isDirty) {
    const saved = await editor.draft.handleSaveDraft(true)
    if (!saved) {
      editor.publishing.setPublishReadiness({
        state: 'failed',
        message: editor.draft.error || 'Draft could not be saved before preview.',
        previewHash: null,
        locales: [],
      })
      publishImpactRequested.value = false
      return
    }
  }
  try {
    const readinessForPreview = (await convexClient().query(
      api.ginkoCms.editor.getEntryReadinessDetail,
      { entryId: editor.loader.entryId },
    )) as StudioEntryReadinessDetail
    await readinessDetailQuery.refresh()
    const scopedReadinessView = mapEntryReadinessDetail({
      readinessDetail: readinessForPreview,
      currentLocale: getCurrentLocale(),
      t: editor.loader.t,
      publishMode: editor.publishing.publishMode,
    })
    const expectedVersion = (editor.loader.entry as { draftVersion?: unknown } | null)?.draftVersion
    if (typeof expectedVersion !== 'number') {
      editor.publishing.setPublishReadiness({
        state: 'failed',
        message: 'The saved draft is not loaded. Reload before previewing website changes.',
        previewHash: null,
        locales: [],
      })
      publishImpactRequested.value = false
      return
    }
    const locales =
      editor.publishing.publishMode === 'all' && !locale
        ? scopedReadinessView.publishLocales
        : [locale ?? editor.loader.currentLocale]
    if (locales.length === 0) {
      editor.publishing.setPublishReadiness({
        state: 'blocked',
        message: scopedReadinessView.blockers[0]
          ? readinessIssueMessage(editor.loader.t, scopedReadinessView.blockers[0])
          : 'No languages are ready to publish.',
        previewHash: null,
        locales: [],
      })
      publishImpactRequested.value = false
      return
    }
    const preview = (await convexClient().mutation(
      api.ginkoCms.editor.previewPublishEntryOperation,
      {
        entryId: editor.loader.entryId,
        locales,
        expectedVersion,
      },
    )) as typeof publishOperationPreview.value
    publishOperationPreview.value = preview
    const operationPreview = derivePublishOperationPreviewState({
      preview,
      locales,
      t: editor.loader.t,
    })
    editor.publishing.setPublishReadiness({
      state: operationPreview.state,
      message: operationPreview.message,
      previewHash: stablePreviewHash(preview?.confirm ?? preview),
      confirmationToken: operationPreview.confirmationToken,
      confirmationExpiresAt: operationPreview.confirmationExpiresAt,
      locales: operationPreview.locales,
    })
  } catch (error) {
    editor.publishing.setPublishReadiness({
      state: 'failed',
      message:
        error instanceof Error
          ? `We could not prepare the website preview. ${error.message}`
          : 'We could not prepare the website preview.',
      previewHash: null,
      locales: [],
    })
    publishImpactRequested.value = false
    return
  }
  publishImpactRequested.value = true
}

async function reviewTranslationReadiness(_locale: string) {
  try {
    await readinessDetailQuery.refresh()
  } catch {
    return
  }
}

async function requestPublishReview(locale = editor.loader.currentLocale) {
  const localeReadiness =
    readinessDetail.value?.locales.find((row) => row.locale === locale) ?? null
  if (!localeReadiness?.canRequestReview || requestReviewPending.value) return
  requestReviewPending.value = true
  editor.draft.error = ''
  try {
    if (editor.draft.isDirty) {
      const saved = await editor.draft.handleSaveDraft(true)
      if (!saved) {
        if (!editor.draft.error) editor.draft.error = 'Draft could not be saved before review.'
        return
      }
    }
    const expectedVersion = (editor.loader.entry as { draftVersion?: unknown } | null)?.draftVersion
    if (typeof expectedVersion !== 'number') {
      throw new TypeError('The saved draft is not loaded. Reload before requesting review.')
    }
    await convexClient().mutation(api.ginkoCms.reviewRequests.requestPublishReview, {
      entryId: editor.loader.entryId,
      locales: [locale],
      expectedVersion,
      title: `Publish ${editor.loader.collection} (${locale.toUpperCase()})`,
      summary: 'Ready for publisher review.',
    })
    await readinessDetailQuery.refresh()
  } catch (error) {
    editor.draft.error = getCmsErrorMessage(error, 'Review request could not be created.')
  } finally {
    requestReviewPending.value = false
  }
}
</script>

<template>
  <StudioEntryEditorShell>
    <template #top>
      <StudioEntryTopBar
        :readiness-detail="readinessDetail"
        :request-review-pending="requestReviewPending"
        @preview-publish-impact="(locale?: string) => previewPublishImpact(locale)"
        @request-publish-review="(locale?: string) => requestPublishReview(locale)"
      />
    </template>

    <template #toolbar>
      <StudioEntryCompareToolbar />
    </template>

    <div
      v-if="editor.draft.error"
      class="ginko:rounded-lg ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
    >
      <div class="ginko:flex ginko:items-start ginko:gap-2">
        <AlertCircle class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
        <div>
          <template v-if="editor.draft.error.includes(';')">
            <ul class="list-inside list-disc ginko:space-y-0.5">
              <li v-for="(msg, i) in editor.draft.error.split('; ')" :key="i">
                {{ msg }}
              </li>
            </ul>
          </template>
          <template v-else>
            {{ editor.draft.error }}
          </template>
        </div>
      </div>
    </div>

    <div v-if="editor.loader.pending" class="ginko:space-y-5">
      <div
        class="ginko:space-y-4 ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-5 ginko:shadow-sm"
      >
        <Skeleton
          v-for="i in 5"
          :key="`skeleton-field-${i}`"
          class="ginko:h-10 ginko:w-full ginko:rounded-md"
        />
      </div>
    </div>

    <template v-else-if="editor.loader.entry">
      <div class="ginko:grid ginko:gap-5">
        <div>
          <StudioSharedFieldsPanel />
        </div>

        <div
          class="studio-entry-locale-panels ginko:grid ginko:grid-cols-1 ginko:items-start ginko:gap-5"
          :class="
            isCompareMode ? 'studio-page-content--bleed studio-entry-locale-panels--compare' : ''
          "
        >
          <StudioLocaleEditorPanel side="primary" :status="primaryLocaleStatus" />
          <StudioLocaleEditorPanel
            v-if="isCompareMode"
            side="secondary"
            :status="secondaryLocaleStatus"
            :missing-fields="secondaryLocaleMissingFields"
          />
        </div>

        <div v-if="advancedEditor" class="ginko:grid ginko:gap-4">
          <div
            class="ginko:px-1 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
          >
            Advanced publishing checks
          </div>
          <StudioEntryPublicWorkflowPanel
            :public-visibility="publicVisibility"
            :route-validation-requested="routeValidationRequested"
            :route-validation-state="routeValidationState"
            :publish-impact-requested="publishImpactRequested"
            :publish-impact="publishImpact"
            preview-scope="publish"
            :publish-review="publishReview"
            :selected-publish-impact-locale="selectedPublishImpactLocale"
            @preview-publish-impact="() => previewPublishImpact(editor.loader.currentLocale)"
            @validate-public-routes="validatePublicRoutes"
          />
          <StudioEntryTranslationReadinessPanel
            :current-locale="editor.loader.currentLocale"
            :items="translationReadiness"
            :saving="editor.draft.saving"
            @review="reviewTranslationReadiness"
          />
        </div>
      </div>
    </template>

    <div v-else class="ginko:py-16 ginko:text-center ginko:text-muted-foreground">
      {{ editor.loader.t('ginkoCms.studio.collectionEditor.entryNotFound') }}
    </div>

    <template #rail>
      <StudioEntryStatusRail
        v-if="!editor.loader.pending && editor.loader.entry"
        :readiness-detail="readinessDetail"
        :readiness-pending="readinessDetailQuery.pending.value"
        :public-visibility="publicVisibility"
        :route-validation-requested="routeValidationRequested"
        :route-validation-state="routeValidationState"
        :translation-readiness="translationReadiness"
        @validate-public-routes="validatePublicRoutes"
        @review-translation-readiness="reviewTranslationReadiness"
      />
    </template>
    <template #rail-actions>
      <Button
        variant="outline"
        size="sm"
        :disabled="editor.loader.pending || editor.draft.saving || !currentReadinessView.canPreview"
        @click="previewPublishImpact(editor.loader.currentLocale)"
      >
        Preview website changes
      </Button>
      <Button
        v-if="isRouteBackedEntry"
        variant="outline"
        size="sm"
        :disabled="editor.loader.pending"
        @click="validatePublicRoutes"
      >
        Check links
      </Button>
    </template>
  </StudioEntryEditorShell>

  <StudioCheckpointDialog />
  <StudioPublishDialog
    :readiness-detail="readinessDetail"
    :publish-impact-requested="publishImpactRequested"
  />
</template>

<style scoped>
.studio-entry-locale-panels {
  min-width: 0;
}

.studio-entry-locale-panels > * {
  min-width: 0;
}

@media (min-width: 1600px) {
  .studio-entry-locale-panels--compare {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
