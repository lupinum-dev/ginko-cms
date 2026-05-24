<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { provideStudioEntryEditorContext } from '../../composables/internal/studioEntryEditorContext'
import { useStudioEntryEditor } from '../../composables/internal/useStudioEntryEditor'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useStudioAdvancedEditor } from '../../composables/useStudioAdvancedEditor'
import {
  derivePublishReadinessFromOperationPreview,
  deriveTranslationSuggestedAction,
  mapPreviewPanelState,
  type PreviewResultStatus,
} from '../../lib/publicWorkflow'
const studioHost = useStudioHostContext()
const editor = useStudioEntryEditor()
provideStudioEntryEditorContext(editor)
const advancedEditor = useStudioAdvancedEditor()

const STATUS_LABELS: Record<string, string> = {
  public: 'Public',
  draft_only: 'Draft only',
  missing_route: 'Missing route',
  missing_required_fields: 'Missing required fields',
  parent_not_public: 'Parent not public',
  collision: 'Collision',
  excluded: 'Not public',
}
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

const visibilityQuery = useCmsStudioQuery(
  api.ginkoCms.diagnostics.explainPublicVisibility,
  computed(() => ({
    collection: editor.loader.collection,
    entryId: editor.loader.entryId,
  })),
)
const routeValidationRequested = ref(false)
const publishImpactRequested = ref(false)
const selectedPublishImpactLocale = ref<string | null>(null)
const previewScope = ref<'publish' | 'workflow' | null>(null)
const publishImpactStale = ref(false)
const workflowPreviewStale = ref(false)
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
const publishImpactQuery = useCmsStudioQuery(
  api.ginkoCms.diagnostics.previewPublishImpact,
  computed(() =>
    publishImpactRequested.value && previewScope.value !== 'publish'
      ? {
          collection: editor.loader.collection,
          entryId: editor.loader.entryId,
          ...(selectedPublishImpactLocale.value
            ? { locale: selectedPublishImpactLocale.value }
            : {}),
        }
      : null,
  ),
  { keepPreviousData: true },
)

const entryScopeKey = computed(() => `${editor.loader.collection}:${editor.loader.entryId}`)
watch(entryScopeKey, () => {
  routeValidationRequested.value = false
  publishImpactRequested.value = false
  selectedPublishImpactLocale.value = null
  previewScope.value = null
  publishImpactStale.value = false
  workflowPreviewStale.value = false
})

function getCurrentLocale() {
  return typeof editor.loader.currentLocale === 'string'
    ? editor.loader.currentLocale
    : editor.loader.currentLocale.value
}

function statusLabel(status: string | null | undefined) {
  return STATUS_LABELS[status ?? ''] ?? 'Not public'
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
          publishedState: variant?.published || isPublic ? 'Published' : 'Not published',
          draftPath: variant?.draftPath ?? null,
          publishedPath: variant?.publishedPath ?? null,
          label: statusLabel(localeState.status),
          diagnostics: rowDiagnostics,
          visibleDiagnostics: rowDiagnostics.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
          hiddenDiagnosticCount: Math.max(rowDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
          secondaryLabels: (localeState.secondaryStatuses ?? []).map(statusLabel),
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
          ? 'Visibility unknown'
          : !isRouteBacked
            ? 'Data-only'
            : 'Visibility by locale',
    localeRows,
    globalDiagnostics,
    hiddenGlobalDiagnosticCount: Math.max(globalDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
    publishedLocales: publicLocales.map((item: { locale: string }) => item.locale),
    pending: visibilityQuery.pending.value,
    error: visibilityQuery.error.value,
    errorMessage: queryErrorMessage(
      visibilityQuery.error.value,
      'Public visibility could not be loaded.',
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
      message: 'Validating public routes...',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  if (routeValidationQuery.error.value) {
    return {
      state: 'error',
      message: queryErrorMessage(routeValidationQuery.error.value, 'Route validation failed.'),
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  const data = routeValidationQuery.data.value
  if (!Array.isArray(data)) {
    return {
      state: 'missing',
      message: 'Route validation returned no usable result.',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  if (data.length === 0) {
    return {
      state: 'empty',
      message: 'Site route validation: no diagnostics.',
      diagnostics: [],
      hiddenDiagnosticCount: 0,
    }
  }
  return {
    state: 'found',
    message: `Site route validation: ${data.length} diagnostic${data.length === 1 ? '' : 's'}.`,
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
  if (previewScope.value === 'publish' && publishOperationPreview.value) {
    const preview = publishOperationPreview.value
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
        }
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
  }
  if (
    (previewScope.value === 'publish' && publishImpactStale.value) ||
    (previewScope.value === 'workflow' && workflowPreviewStale.value)
  ) {
    return {
      state: 'stale',
      message:
        previewScope.value === 'workflow'
          ? 'Read-only readiness preview is stale. Refresh it before relying on the result.'
          : 'Website changes preview is stale. Preview again before publishing.',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: null,
    }
  }
  if (publishImpactQuery.pending.value) {
    return {
      state: 'pending',
      message: 'Previewing website changes...',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: true,
      error: null,
    }
  }
  if (publishImpactQuery.error.value) {
    return {
      state: 'error',
      message: queryErrorMessage(
        publishImpactQuery.error.value,
        'Website changes could not be loaded.',
      ),
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: publishImpactQuery.error.value,
    }
  }
  const data = publishImpactQuery.data.value
  if (!data || !Array.isArray(data.locales)) {
    return {
      state: 'missing',
      message: 'Website changes preview returned no usable result.',
      cacheTags: [],
      events: [],
      locales: [],
      status: null,
      pending: false,
      error: null,
    }
  }
  return {
    state: mapPreviewPanelState(data.status as PreviewResultStatus),
    message: impactStatusLabel(data.status),
    cacheTags: Array.isArray(data.cacheTags) ? data.cacheTags : [],
    events: Array.isArray(data.events) ? data.events : [],
    locales: data.locales.map(
      (localeState: {
        locale: string
        status: string
        currentHref: string | null
        nextHref: string | null
        currentPath: string | null
        nextPath: string | null
        sitemap: { before: boolean; after: boolean }
        search: { before: boolean; after: boolean }
        nav: { before: boolean; after: boolean }
        changes: Array<{
          kind: string
          label: string
          before: string | boolean | null
          after: string | boolean | null
        }>
        blockingDiagnostics: Array<{ code: string; severity: string; message: string }>
        warnings: Array<{ code: string; severity: string; message: string }>
      }) => ({
        ...localeState,
        label: impactStatusLabel(localeState.status),
        visibleBlockers: localeState.blockingDiagnostics.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
        hiddenBlockerCount: Math.max(
          localeState.blockingDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE,
          0,
        ),
        visibleWarnings: localeState.warnings.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
      }),
    ),
    status: data.status,
    pending: false,
    error: null,
  }
})

const translationReadiness = computed(() =>
  editor.loader.locales
    .filter((locale: { code: string; label?: string }) => locale.code !== getCurrentLocale())
    .map((locale: { code: string; label?: string }) => {
      const localeState = publicVisibility.value.localeRows.find(
        (row: { locale: string }) => row.locale === locale.code,
      )
      const variant = findLocaleVariant(locale.code)
      const visibilityKnown =
        !visibilityQuery.pending.value && !visibilityQuery.error.value && !!localeState
      const impact =
        previewScope.value === 'workflow'
          ? publishImpact.value.locales.find(
              (localeImpact: { locale: string }) => localeImpact.locale === locale.code,
            )
          : null
      const diagnosticCodes = new Set(
        (localeState?.diagnostics ?? []).map((diagnostic: { code: string }) => diagnostic.code),
      )
      const missingFields = localeState?.missingRequiredFields ?? []
      const missingRoute =
        localeState?.status === 'missing_route' || diagnosticCodes.has('missing_locale_route')
      const parentBlocked =
        localeState?.status === 'parent_not_public' || diagnosticCodes.has('missing_parent_route')
      const suggestedAction = deriveTranslationSuggestedAction({
        visibilityKnown,
        variantExists: !!variant,
        parentBlocked,
        missingRoute,
        missingFields,
        impactStatus: impact?.status as PreviewResultStatus | null | undefined,
        published: !!variant?.published,
      })

      return {
        locale: locale.code,
        label: locale.label || locale.code,
        exists: !!variant,
        published: !!variant?.published,
        draftPath: variant?.draftPath ?? null,
        status: visibilityQuery.pending.value
          ? 'Checking visibility'
          : visibilityQuery.error.value || !localeState
            ? 'Visibility unknown'
            : localeState.label,
        missingFields,
        missingRoute,
        parentBlocked,
        impactLabel:
          previewScope.value === 'workflow' && workflowPreviewStale.value
            ? 'Stale preview'
            : impact
              ? impactStatusLabel(impact.status)
              : 'Not previewed',
        suggestedAction,
      }
    }),
)

const primaryLocaleVisibility = computed(() =>
  publicVisibility.value.localeRows.find(
    (row: { locale: string }) => row.locale === editor.loader.currentLocale,
  ),
)

const secondaryLocaleVisibility = computed(() =>
  publicVisibility.value.localeRows.find(
    (row: { locale: string }) => row.locale === editor.locales.secondaryLocale,
  ),
)

const isCompareMode = computed(
  () => editor.locales.translationMode && Boolean(editor.locales.secondaryLocale),
)

const publishReview = computed(() => {
  const readiness = editor.publishing.publishReadiness
  return {
    blocked: readiness.state === 'blocked',
    failed: readiness.state === 'failed',
    label: readiness.state === 'ready' ? 'Ready' : readiness.state,
    locales: readiness.locales,
    message: readiness.message,
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
      if (previewScope.value === 'publish') publishImpactStale.value = true
      if (previewScope.value === 'workflow') workflowPreviewStale.value = true
    }
  },
)

watch(
  () => [editor.loader.currentLocale, editor.publishing.publishMode],
  () => {
    publishOperationPreview.value = null
    editor.publishing.markPublishReadinessStale('Publish scope changed after the last preview.')
    if (previewScope.value === 'publish') publishImpactStale.value = true
  },
)

watch(
  () => ({ ...editor.locales.secondaryDataFields }),
  () => {
    if (
      previewScope.value === 'workflow' &&
      selectedPublishImpactLocale.value &&
      selectedPublishImpactLocale.value === editor.locales.secondaryLocale
    ) {
      workflowPreviewStale.value = true
    }
  },
)

watch(
  () => publishImpactQuery.pending.value,
  (pending) => {
    if (publishImpactRequested.value && previewScope.value === 'publish' && pending) {
      editor.publishing.setPublishReadiness({
        state: 'pending',
        message: 'Previewing website changes...',
        previewHash: null,
        locales: [],
      })
    }
  },
)

watch(
  () => publishImpactQuery.error.value,
  (error) => {
    if (!publishImpactRequested.value || previewScope.value !== 'publish' || !error) return
    editor.publishing.setPublishReadiness({
      state: 'failed',
      message: queryErrorMessage(error, 'Website changes could not be loaded.'),
      previewHash: null,
      locales: [],
    })
  },
)

async function validatePublicRoutes() {
  if (!isRouteBackedEntry.value) return
  routeValidationRequested.value = true
  await routeValidationQuery.refresh()
}

async function previewPublishImpact(
  locale?: string,
  options: { saveDraft?: boolean; scope?: 'publish' | 'workflow' } = {},
) {
  const scope = options.scope ?? 'publish'
  selectedPublishImpactLocale.value = locale ?? null
  previewScope.value = scope
  publishImpactStale.value = false
  workflowPreviewStale.value = false
  if (scope === 'publish') {
    editor.publishing.setPublishReadiness({
      state: 'pending',
      message:
        options.saveDraft === false
          ? 'Previewing website changes...'
          : 'Saving draft and previewing website changes...',
      previewHash: null,
      locales: [],
    })
  }
  if (options.saveDraft !== false && editor.draft.isDirty) {
    const saved = await editor.draft.handleSaveDraft(true)
    if (!saved) {
      if (scope === 'publish') {
        editor.publishing.setPublishReadiness({
          state: 'failed',
          message: editor.draft.error || 'Draft could not be saved before preview.',
          previewHash: null,
          locales: [],
        })
      }
      publishImpactRequested.value = false
      return
    }
  }
  if (scope === 'publish') {
    const expectedVersion = (editor.loader.entry as { draftVersion?: unknown } | null)?.draftVersion
    if (typeof expectedVersion !== 'number') {
      editor.publishing.setPublishReadiness({
        state: 'failed',
        message: 'Draft version is not loaded. Reload before previewing publish impact.',
        previewHash: null,
        locales: [],
      })
      publishImpactRequested.value = false
      return
    }
    const locales =
      editor.publishing.publishMode === 'all' && !locale
        ? editor.loader.localeVariants.map((variant: { locale: string }) => variant.locale)
        : [locale ?? editor.loader.currentLocale]
    try {
      const preview = (await convexClient().mutation(
        api.ginkoCms.editor.previewPublishEntryOperation,
        {
          entryId: editor.loader.entryId,
          locales,
          expectedVersion,
        },
      )) as typeof publishOperationPreview.value
      publishOperationPreview.value = preview
      const readiness = derivePublishReadinessFromOperationPreview({
        preview,
        locales,
      })
      editor.publishing.setPublishReadiness({
        state: readiness.state,
        message: readiness.message,
        previewHash: stablePreviewHash(preview?.confirm ?? preview),
        confirmationToken: readiness.confirmationToken,
        confirmationExpiresAt: readiness.confirmationExpiresAt,
        locales: readiness.locales,
      })
    } catch (error) {
      editor.publishing.setPublishReadiness({
        state: 'failed',
        message:
          error instanceof Error
            ? `Publish operation preview failed. ${error.message}`
            : 'Publish operation preview failed.',
        previewHash: null,
        locales: [],
      })
      publishImpactRequested.value = false
      return
    }
    publishImpactRequested.value = true
    return
  }
  publishImpactRequested.value = true
  await publishImpactQuery.refresh()
  if (scope === 'workflow' && editor.draft.isDirty) {
    workflowPreviewStale.value = true
  }
}

async function reviewTranslationReadiness(locale: string) {
  try {
    await visibilityQuery.refresh()
  } catch {
    workflowPreviewStale.value = false
    previewScope.value = 'workflow'
    publishImpactRequested.value = false
    return
  }
  await previewPublishImpact(locale, { saveDraft: false, scope: 'workflow' })
}
</script>

<template>
  <StudioEntryEditorShell>
    <template #top>
      <StudioEntryTopBar
        @preview-publish-impact="(locale?: string) => previewPublishImpact(locale)"
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
          <StudioLocaleEditorPanel side="primary" :status="primaryLocaleVisibility?.label" />
          <StudioLocaleEditorPanel
            v-if="isCompareMode"
            side="secondary"
            :status="secondaryLocaleVisibility?.label"
            :missing-fields="secondaryLocaleVisibility?.missingRequiredFields ?? []"
          />
        </div>

        <div v-if="advancedEditor" class="ginko:grid ginko:gap-4">
          <div
            class="ginko:px-1 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
          >
            Publishing diagnostics
          </div>
          <StudioEntryPublicWorkflowPanel
            :public-visibility="publicVisibility"
            :route-validation-requested="routeValidationRequested"
            :route-validation-state="routeValidationState"
            :publish-impact-requested="publishImpactRequested"
            :publish-impact="publishImpact"
            :preview-scope="previewScope"
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
        :public-visibility="publicVisibility"
        :publish-impact-requested="publishImpactRequested"
        :publish-impact="publishImpact"
        :preview-scope="previewScope"
        :publish-review="publishReview"
        :selected-publish-impact-locale="selectedPublishImpactLocale"
        :route-validation-requested="routeValidationRequested"
        :route-validation-state="routeValidationState"
        :translation-readiness="translationReadiness"
        @preview-publish-impact="() => previewPublishImpact(editor.loader.currentLocale)"
        @validate-public-routes="validatePublicRoutes"
        @review-translation-readiness="reviewTranslationReadiness"
      />
    </template>
  </StudioEntryEditorShell>

  <StudioCheckpointDialog />
  <StudioPublishDialog
    :public-visibility="publicVisibility"
    :publish-review="publishReview"
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

@media (min-width: 1280px) {
  .studio-entry-locale-panels--compare {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
