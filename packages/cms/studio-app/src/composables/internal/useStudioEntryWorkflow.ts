import { getCmsErrorCode, getCmsErrorMessage } from '@public/utils/cmsErrors'
import { useConvex } from 'better-convex-vue'
import { computed, reactive, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import type {
  StudioEntryReadinessDetail,
  StudioPublishImpactLocale,
  StudioPublishImpactState,
  StudioReadinessLocale,
} from '../../components/studio/editor/studioWorkflowTypes'
import {
  derivePublishOperationPreviewState,
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
  readinessStateLabel,
} from '../../lib/publicWorkflow'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useStudioAdvancedEditor } from '../useStudioAdvancedEditor'
import { useConvexMutation } from '../useStudioConvex'
import type { PublishSessionPreview } from './useEntryPublishing'
import type { StudioEntryEditorContextBase } from './useStudioEntryEditor'

// Public-workflow orchestration for the entry editor (RFC Phase 5 / D8).
//
// This logic previously lived inline in `pages/[collection]/:id.vue`. It was
// extracted so the derived state and the publish/preview handlers can be shared
// by BOTH the editor page subtree (top bar, publish dialog) AND the right-sidebar
// details panel — which renders in the LAYOUT tree, outside the page subtree, so
// it cannot reach page-local `const`s. The workflow object is attached to the
// reactive editor context (`editor.workflow`), so the panel receives it for free
// through the `props: () => ({ editor })` getter and re-provides the same context.
// Single source of truth: the publish preview state the top bar triggers is the
// exact state the panel and the shared publish dialog render.

const IMPACT_STATUS_LABELS: Record<string, string> = {
  ready: 'Website changes ready',
  blocked: 'Blocked',
  no_changes: 'No public changes',
  not_publishable: 'Not publishable',
}
const MAX_DIAGNOSTICS_PER_LOCALE = 3

function clearReactiveRecord(record: Record<string, unknown>) {
  for (const key of Object.keys(record)) Reflect.deleteProperty(record, key)
}

type PublishImpactLocaleDetails = Omit<
  StudioPublishImpactLocale,
  'hiddenBlockerCount' | 'label' | 'visibleBlockers' | 'visibleWarnings'
>
export type StudioEntryWorkflow = ReturnType<typeof useStudioEntryWorkflow>

export function useStudioEntryWorkflow(editor: StudioEntryEditorContextBase) {
  const convex = useConvex()
  const previewPublishMutation = useConvexMutation(api.ginkoCms.editor.previewPublishEntryOperation)
  const requestPublishReviewMutation = useConvexMutation(
    api.ginkoCms.reviewRequests.requestPublishReview,
  )
  const advancedEditor = useStudioAdvancedEditor()
  const publishSession = editor.publishing.publishSession

  const requestReviewPending = ref(false)
  const publishImpactPagePending = reactive<Record<string, boolean>>({})
  const publishImpactPageError = reactive<Record<string, string | null>>({})

  const visibilityQuery = useCmsStudioQuery(
    api.ginkoCms.diagnostics.explainPublicVisibility,
    computed(() =>
      advancedEditor.value
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
  const entryScopeKey = computed(() => `${editor.loader.collection}:${editor.loader.entryId}`)
  watch(entryScopeKey, () => {
    requestReviewPending.value = false
    clearReactiveRecord(publishImpactPagePending)
    clearReactiveRecord(publishImpactPageError)
    editor.publishing.resetPublishSession()
  })

  const readinessDetail = computed(() => {
    const detail = readinessDetailQuery.data.value
    return detail && typeof detail === 'object' ? (detail as StudioEntryReadinessDetail) : null
  })
  const readinessPending = computed(() => readinessDetailQuery.pending.value)

  const currentReadinessView = computed(() =>
    mapEntryReadinessDetail({
      readinessDetail: readinessDetail.value,
      currentLocale: getCurrentLocale(),
      t: editor.loader.t,
      publishMode: 'single',
    }),
  )

  function getCurrentLocale() {
    return editor.loader.currentLocale
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
            publishedState: variant?.publishedPath || isPublic ? 'Live' : 'Not live',
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
      hiddenGlobalDiagnosticCount: Math.max(
        globalDiagnostics.length - MAX_DIAGNOSTICS_PER_LOCALE,
        0,
      ),
      publishedLocales: publicLocales.map((item: { locale: string }) => item.locale),
      pending: visibilityQuery.pending.value,
      error: visibilityQuery.error.value,
      errorMessage: queryErrorMessage(
        visibilityQuery.error.value,
        'Live website status could not be loaded.',
      ),
    }
  })

  const publishImpact = computed<StudioPublishImpactState>(() => {
    if (!publishSession.impactRequested) {
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
    if (publishSession.readiness.state === 'pending') {
      return {
        state: 'pending',
        message: publishSession.readiness.message,
        cacheTags: [],
        events: [],
        locales: [],
        status: null,
        pending: true,
        error: null,
      }
    }
    // Preview preparation failed (e.g. the entry changed in another session):
    // surface the failure itself instead of the generic "missing" copy — and
    // never pretend a preview exists.
    if (publishSession.readiness.state === 'failed') {
      return {
        state: 'failed',
        message:
          publishSession.readiness.message ||
          editor.loader.t('ginkoCms.studio.workflow.preview.failed'),
        cacheTags: [],
        events: [],
        locales: [],
        status: null,
        pending: false,
        error: null,
      }
    }
    if (publishSession.impactStale) {
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
    const preview = publishSession.preview
    const publishImpactDetails = preview?.details?.publishImpact
    if (!preview || !publishImpactDetails) {
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
    const blocked =
      preview.allowed === false ||
      preview.blockers.length > 0 ||
      publishImpactDetails.status === 'blocked' ||
      publishImpactDetails.status === 'not_publishable'
    const warning = preview.warnings[0]?.message
    const detailsLocales: PublishImpactLocaleDetails[] = publishImpactDetails.locales
    return {
      state: blocked ? 'blocked' : 'ready',
      message:
        preview.blockers[0]?.message ?? warning ?? preview.summary ?? 'Publish preview is ready.',
      cacheTags: publishImpactDetails.cacheTags,
      events: publishImpactDetails.events,
      locales: detailsLocales.map((locale): StudioPublishImpactLocale => {
        const blockers = locale.blockingDiagnostics
        const warnings = locale.warnings
        return {
          ...locale,
          routeImpact: {
            ...locale.routeImpact,
            loading: publishImpactPagePending[locale.locale] ?? false,
            error: publishImpactPageError[locale.locale] ?? null,
          },
          label: impactStatusLabel(locale.status),
          visibleBlockers: blockers.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
          hiddenBlockerCount: Math.max(blockers.length - MAX_DIAGNOSTICS_PER_LOCALE, 0),
          visibleWarnings: warnings.slice(0, MAX_DIAGNOSTICS_PER_LOCALE),
        }
      }),
      status: publishImpactDetails.status,
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
          published: localeReadiness?.published ?? variant?.publishedPath != null,
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

  // Raw state codes for tone decisions — labels above are display-only and
  // localized, so anything deriving semantics must use these instead.
  const primaryLocaleState = computed(() => currentReadinessView.value.currentLocale?.state ?? null)
  const primaryLocaleBlocked = computed(
    () => (currentReadinessView.value.currentLocale?.blockers.length ?? 0) > 0,
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

  const secondaryLocaleState = computed(() => secondaryLocaleReadiness.value?.state ?? null)
  const secondaryLocaleBlocked = computed(
    () => (secondaryLocaleReadiness.value?.blockers.length ?? 0) > 0,
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
    const readiness = publishSession.readiness
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
      stale: readiness.state === 'stale',
      state: readiness.state,
    }
  })

  watch(
    () => editor.draft.isDirty,
    (dirty) => {
      if (dirty) {
        publishSession.preview = null
        editor.publishing.markPublishReadinessStale()
        if (publishSession.impactRequested) publishSession.impactStale = true
        publishSession.draftPreviewOpened = false
      }
    },
  )

  watch(
    () => [editor.loader.currentLocale, publishSession.mode],
    () => {
      publishSession.preview = null
      editor.publishing.markPublishReadinessStale('Publish scope changed after the last preview.')
      if (publishSession.impactRequested) publishSession.impactStale = true
      publishSession.draftPreviewOpened = false
    },
  )

  function markDraftPreviewOpened() {
    publishSession.draftPreviewOpened = true
  }

  // The preview could not be prepared because another session changed the
  // entry. Present it as exactly that — the recovery is the same "Reload
  // latest draft" the top bar's conflict notice offers.
  function failPreviewForConcurrentEdit() {
    publishSession.concurrentEdit = true
    editor.publishing.setPublishReadiness({
      state: 'failed',
      message: editor.loader.t('ginkoCms.studio.workflow.preview.concurrentEdit'),
      locales: [],
    })
    publishSession.impactRequested = true
  }

  // Recovery action for the concurrent-edit failure: hydrate the latest draft
  // (discarding this session's stale form state) and immediately re-run the
  // publish preview so the dialog/panel show fresh, truthful state.
  async function reloadLatestDraftAndPreview() {
    editor.draft.requestHydrate()
    publishSession.concurrentEdit = false
    if (publishSession.mode === 'all') {
      await previewPublishImpact()
      return
    }
    await previewPublishImpact(editor.loader.currentLocale)
  }

  async function previewPublishImpact(locale?: string, options: { saveDraft?: boolean } = {}) {
    clearReactiveRecord(publishImpactPagePending)
    clearReactiveRecord(publishImpactPageError)
    publishSession.preview = null
    publishSession.impactRequested = true
    publishSession.impactLocale = locale ?? null
    publishSession.impactStale = false
    publishSession.concurrentEdit = false
    // Known-stale session: the entry already changed elsewhere, so preparing a
    // preview from this form state can only fail. Say so up front.
    if (editor.draft.saveConflict) {
      failPreviewForConcurrentEdit()
      return
    }
    editor.publishing.setPublishReadiness({
      state: 'pending',
      message:
        options.saveDraft === false
          ? 'Previewing website changes...'
          : 'Saving draft and previewing website changes...',
      locales: [],
    })
    if (options.saveDraft !== false && editor.draft.isDirty) {
      const saved = await editor.draft.handleSaveDraft(true)
      if (!saved) {
        // The save was refused because another session already advanced the
        // draft — the same conflict the top bar notice describes.
        if (editor.draft.saveConflict) {
          failPreviewForConcurrentEdit()
          return
        }
        editor.publishing.setPublishReadiness({
          state: 'failed',
          message: editor.draft.error || 'Draft could not be saved before preview.',
          locales: [],
        })
        return
      }
    }
    try {
      const readinessForPreview = (await convex.query(api.ginkoCms.editor.getEntryReadinessDetail, {
        entryId: editor.loader.entryId,
      })) as StudioEntryReadinessDetail
      await readinessDetailQuery.refresh()
      const scopedReadinessView = mapEntryReadinessDetail({
        readinessDetail: readinessForPreview,
        currentLocale: getCurrentLocale(),
        t: editor.loader.t,
        publishMode: publishSession.mode,
      })
      const expectedVersion =
        editor.draft.lastHydratedVersion ??
        (editor.loader.entry as { draftVersion?: unknown } | null)?.draftVersion
      if (typeof expectedVersion !== 'number') {
        editor.publishing.setPublishReadiness({
          state: 'failed',
          message: 'The saved draft is not loaded. Reload before previewing website changes.',
          locales: [],
        })
        return
      }
      const locales =
        publishSession.mode === 'all' && !locale
          ? scopedReadinessView.publishLocales
          : [locale ?? editor.loader.currentLocale]
      if (locales.length === 0) {
        editor.publishing.setPublishReadiness({
          state: 'blocked',
          message: scopedReadinessView.blockers[0]
            ? readinessIssueMessage(editor.loader.t, scopedReadinessView.blockers[0])
            : 'No languages are ready to publish.',
          locales: [],
        })
        publishSession.impactRequested = false
        return
      }
      const preview = (await previewPublishMutation({
        entryId: editor.loader.entryId,
        locales,
        message: publishSession.message.trim() || undefined,
        expectedVersion,
      })) as PublishSessionPreview
      publishSession.preview = preview
      const operationPreview = derivePublishOperationPreviewState({
        preview,
        locales,
        t: editor.loader.t,
      })
      editor.publishing.setPublishReadiness({
        state: operationPreview.state,
        message: operationPreview.message,
        confirmationToken: operationPreview.confirmationToken,
        confirmationExpiresAt: operationPreview.confirmationExpiresAt,
        locales: operationPreview.locales,
      })
    } catch (error) {
      if (getCmsErrorCode(error) === 'ENTRY_CONCURRENT_EDIT') {
        failPreviewForConcurrentEdit()
        return
      }
      editor.publishing.setPublishReadiness({
        state: 'failed',
        message:
          error instanceof Error
            ? `We could not prepare the website preview. ${error.message}`
            : 'We could not prepare the website preview.',
        locales: [],
      })
      return
    }
  }

  async function loadMorePublishImpact(locale: string) {
    const impactResult = publishSession.preview?.details?.publishImpact
    const localeImpact = impactResult?.locales.find((item) => item.locale === locale)
    const routeImpact = localeImpact?.routeImpact
    if (
      !localeImpact ||
      !routeImpact?.hasMore ||
      !routeImpact.continueCursor ||
      publishImpactPagePending[locale]
    ) {
      return
    }
    const expectedVersion = editor.draft.lastHydratedVersion
    if (typeof expectedVersion !== 'number') {
      publishSession.impactStale = true
      publishImpactPageError[locale] = 'The draft changed. Preview website changes again.'
      return
    }

    publishImpactPagePending[locale] = true
    publishImpactPageError[locale] = null
    try {
      const page = (await convex.query(api.ginkoCms.editor.listPublishRouteImpactPage, {
        entryId: editor.loader.entryId,
        locale,
        expectedVersion,
        expectedRouteGeneration: routeImpact.routeGeneration,
        cursor: routeImpact.continueCursor,
        limit: 25,
      })) as {
        changes: StudioPublishImpactLocale['changes']
        isDone: boolean
        continueCursor: string | null
      }
      localeImpact.changes.push(...page.changes)
      routeImpact.listed += page.changes.length
      routeImpact.hasMore = !page.isDone
      routeImpact.continueCursor = page.continueCursor
      routeImpact.total = page.isDone ? routeImpact.listed : null
    } catch (error) {
      const code = getCmsErrorCode(error)
      if (code === 'PUBLISH_IMPACT_STALE' || code === 'INVALID_CURSOR') {
        publishSession.impactStale = true
      }
      publishImpactPageError[locale] = getCmsErrorMessage(
        error,
        'More affected URLs could not be loaded.',
      )
    } finally {
      publishImpactPagePending[locale] = false
    }
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
      const expectedVersion =
        editor.draft.lastHydratedVersion ??
        (editor.loader.entry as { draftVersion?: unknown } | null)?.draftVersion
      if (typeof expectedVersion !== 'number') {
        throw new TypeError('The saved draft is not loaded. Reload before requesting review.')
      }
      await requestPublishReviewMutation({
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

  return reactive({
    // derived state
    publishSession,
    publishImpact,
    requestReviewPending,
    readinessDetail,
    readinessPending,
    currentReadinessView,
    publicVisibility,
    translationReadiness,
    primaryLocaleStatus,
    primaryLocaleState,
    primaryLocaleBlocked,
    secondaryLocaleStatus,
    secondaryLocaleState,
    secondaryLocaleBlocked,
    secondaryLocaleMissingFields,
    isCompareMode,
    publishReview,
    // handlers
    previewPublishImpact,
    loadMorePublishImpact,
    reviewTranslationReadiness,
    requestPublishReview,
    markDraftPreviewOpened,
    reloadLatestDraftAndPreview,
  })
}
