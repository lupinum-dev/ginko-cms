import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { Ref } from 'vue'
import { nextTick, reactive } from 'vue'
import type { useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import type { StudioPublishImpactResult } from '../../components/studio/editor/studioWorkflowTypes'
import { formatDestructiveConfirmationPrompt, operationValue } from '../../lib/destructiveWorkflow'
import { derivePublishConfirmationState, type PublishPreviewState } from '../../lib/publicWorkflow'
import { useConvexMutation } from '../useStudioConvex'
import type { useStudioDebug } from '../useStudioDebug'
import type { StudioEntry, StudioField, StudioLocaleVariant } from './types'
import { studioConfirm } from './useStudioConfirm'
import { studioPrompt } from './useStudioPrompt'

export interface PublishOperationPreviewState {
  state: PublishPreviewState
  message: string
  confirmationToken: string | null
  confirmationExpiresAt: number | null
  locales: string[]
}

export type PublishSessionPreview = {
  allowed: boolean
  summary: string
  blockers: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  effects: Array<{
    kind: string
    summary: string
    count?: number | null
    minimumCount?: number
    countLabel?: string
  }>
  details?: { publishImpact?: StudioPublishImpactResult } | null
  confirm?: unknown
  confirmation?: { token: string; expiresAt: number }
}

export interface PublishOutcomeState {
  dirtyLocales: string[]
  draftVersion: number | null
  locales: string[]
  message: string | null
  mode: 'single' | 'all'
  versionId: string | null
}

export interface PublishSessionState {
  open: boolean
  mode: 'single' | 'all'
  message: string
  readiness: PublishOperationPreviewState
  preview: PublishSessionPreview | null
  impactRequested: boolean
  impactLocale: string | null
  impactStale: boolean
  draftPreviewOpened: boolean
  concurrentEdit: boolean
  outcome: PublishOutcomeState | null
}

function initialReadiness(message = 'Preview website changes before publishing.') {
  return {
    state: 'not_previewed' as const,
    message,
    confirmationToken: null,
    confirmationExpiresAt: null,
    locales: [],
  }
}

type DestructivePreview = {
  allowed: boolean
  summary: string
  blockers: Array<{ message: string }>
  warnings: Array<{ message: string }>
  confirmation?: { token: string; expiresAt: number }
  details?: {
    publicRoutes?: Array<{ locale: string; href: string; path?: string | null }>
  } | null
}

function destructivePreviewBlocked(preview: DestructivePreview): boolean {
  return preview.allowed === false || preview.blockers.length > 0
}

function destructivePreviewMessage(preview: DestructivePreview): string {
  return preview.blockers[0]?.message ?? preview.warnings[0]?.message ?? preview.summary
}

function destructivePreviewDescription(preview: DestructivePreview, fallback: string): string {
  const warning = preview.warnings[0]?.message
  return warning ? `${preview.summary}\n\n${warning}` : preview.summary || fallback
}

/**
 * Archive confirmation in the impact-preview shape the publish dialog uses:
 * what happens, which public URLs go offline (one per line, per locale), and
 * the restore path — instead of the backend's run-on route list.
 */
function archiveConfirmDescription(
  preview: DestructivePreview,
  fallback: string,
  t: (key: string) => string,
): string {
  const routes = preview.details?.publicRoutes ?? []
  const sections = [preview.summary || fallback]
  if (routes.length > 0) {
    sections.push(routes.map((route) => `${route.locale.toUpperCase()} · ${route.href}`).join('\n'))
  }
  sections.push(t('ginkoCms.studio.collectionEditor.archivedNoticeDescription'))
  return sections.join('\n\n')
}

interface EntryPublishingDeps {
  entry: Ref<StudioEntry | null>
  entryId: Ref<string>
  collection: Ref<string>
  contentRoute: string
  router: ReturnType<typeof useRouter>
  fields: Ref<StudioField[]>
  localeVariants: Ref<StudioLocaleVariant[]>
  currentLocale: Ref<string>
  canPublishEntries: Ref<boolean>
  canArchiveEntries: Ref<boolean>
  canDeleteEntries: Ref<boolean>
  saving: Ref<boolean>
  error: Ref<string>
  isDirty: Ref<boolean>
  form: { slug: string }
  handleSaveDraft: (silent?: boolean) => Promise<boolean>
  buildSharedData: () => Record<string, unknown> | undefined
  buildLocalizedData: (source: Record<string, unknown>) => Record<string, unknown> | undefined
  dataFields: Record<string, unknown>
  studioDebug: ReturnType<typeof useStudioDebug>
  t: (key: string, params?: Record<string, unknown>) => string
  /**
   * The draft version the editor form was hydrated from (useEntryDraft's
   * `lastHydratedVersion`). Unlike `entry.draftVersion` — a live query that
   * advances whenever ANY session saves — this only moves when THIS session
   * hydrates or saves, so it is the version of the content the user is
   * actually looking at and the correct optimistic-concurrency token for
   * publish (mirror of the save path). Optional until the editor context
   * wires it through; without it publish falls back to the live version.
   */
  hydratedDraftVersion?: Ref<number | null>
}

export function useEntryPublishing(deps: EntryPublishingDeps) {
  const {
    entry: _entry,
    entryId,
    collection,
    contentRoute,
    router,
    localeVariants,
    currentLocale,
    canPublishEntries,
    canArchiveEntries,
    canDeleteEntries,
    saving,
    error,
    isDirty,
    form,
    handleSaveDraft,
    studioDebug,
    t,
  } = deps
  const studioHost = useStudioHostContext()

  const publishSession = reactive<PublishSessionState>({
    open: false,
    mode: 'single',
    message: '',
    readiness: initialReadiness(),
    preview: null,
    impactRequested: false,
    impactLocale: null,
    impactStale: false,
    draftPreviewOpened: false,
    concurrentEdit: false,
    outcome: null,
  })

  const publishMutation = useConvexMutation(api.ginkoCms.editor.publishEntry)
  const unpublishMutation = useConvexMutation(api.ginkoCms.editor.unpublishEntry)
  const archiveMutation = useConvexMutation(api.ginkoCms.editor.archiveEntry)
  const restoreMutation = useConvexMutation(api.ginkoCms.editor.restoreEntry)
  const permanentlyDeleteMutation = useConvexMutation(api.ginkoCms.editor.permanentlyDeleteEntry)

  function convexClient() {
    return studioHost.requireConvexClient()
  }

  function setPublishReadiness(
    next: Omit<PublishOperationPreviewState, 'confirmationToken' | 'confirmationExpiresAt'> &
      Partial<Pick<PublishOperationPreviewState, 'confirmationToken' | 'confirmationExpiresAt'>>,
  ) {
    if (next.state === 'pending') publishSession.outcome = null
    publishSession.readiness = {
      ...next,
      confirmationToken: next.confirmationToken ?? null,
      confirmationExpiresAt: next.confirmationExpiresAt ?? null,
    }
  }

  function resetPublishReadiness(message = 'Preview website changes before publishing.') {
    publishSession.readiness = initialReadiness(message)
  }

  function resetPublishSession() {
    Object.assign(publishSession, {
      open: false,
      mode: 'single',
      message: '',
      readiness: initialReadiness(),
      preview: null,
      impactRequested: false,
      impactLocale: null,
      impactStale: false,
      draftPreviewOpened: false,
      concurrentEdit: false,
      outcome: null,
    } satisfies PublishSessionState)
  }

  function markPublishReadinessStale(message = 'Draft changed after the last publish preview.') {
    publishSession.outcome = null
    if (
      publishSession.readiness.state === 'ready' ||
      publishSession.readiness.state === 'blocked'
    ) {
      publishSession.readiness = {
        ...publishSession.readiness,
        state: 'stale',
        message,
        confirmationToken: null,
        confirmationExpiresAt: null,
      }
    }
  }

  function previewToken(preview: DestructivePreview | null): string | null {
    if (!preview || destructivePreviewBlocked(preview)) return null
    if (!preview.confirmation?.token) return null
    if (preview.confirmation.expiresAt <= Date.now()) return null
    return preview.confirmation.token
  }

  function handlePublish() {
    if (!canPublishEntries.value) return false
    publishSession.mode = 'single'
    publishSession.open = true
    return true
  }

  function handlePublishAll() {
    if (!canPublishEntries.value) return false
    publishSession.mode = 'all'
    publishSession.open = true
    return true
  }

  async function confirmPublish() {
    if (!canPublishEntries.value) return
    const publishConfirmation = derivePublishConfirmationState({
      readinessState: publishSession.readiness.state,
      t: deps.t,
      confirmationToken: publishSession.readiness.confirmationToken,
      confirmationExpiresAt: publishSession.readiness.confirmationExpiresAt,
    })
    if (!publishConfirmation.canConfirm) {
      error.value =
        publishConfirmation.disabledReason ?? 'Preview website changes before publishing.'
      return
    }
    saving.value = true
    error.value = ''
    const locales =
      publishSession.mode === 'all'
        ? publishSession.readiness.locales.length > 0
          ? publishSession.readiness.locales
          : localeVariants.value.map((variant) => variant.locale)
        : [currentLocale.value]
    const message = publishSession.message.trim() || undefined
    studioDebug.debug('publish:start', {
      collection: collection.value,
      entryId: entryId.value,
      slug: form.slug,
      mode: publishSession.mode,
    })
    try {
      if (isDirty.value) {
        const saved = await handleSaveDraft(true)
        resetPublishReadiness('Draft was saved. Preview website changes again before publishing.')
        if (!saved) {
          if (!error.value) error.value = 'Draft could not be saved before publishing.'
        }
        return
      }
      const token = publishConfirmation.token
      if (!token) {
        throw new Error('Preview website changes again before publishing.')
      }
      // Prefer the session-held hydrated version over the live query: a tab
      // holding a stale draft must not publish content it has never seen —
      // the backend rejects a stale expectedVersion with ENTRY_CONCURRENT_EDIT.
      const expectedVersion = deps.hydratedDraftVersion
        ? deps.hydratedDraftVersion.value
        : _entry.value?.draftVersion
      if (typeof expectedVersion !== 'number') {
        throw new TypeError('The saved draft is not loaded. Reload before publishing.')
      }
      const result = operationValue<{
        dirtyLocales: unknown
        draftVersion: unknown
        versionId: unknown
      }>(
        await publishMutation({
          entryId: entryId.value,
          locales,
          message,
          expectedVersion,
          _confirmationToken: token,
        }),
      )
      publishSession.outcome = {
        dirtyLocales: Array.isArray(result.dirtyLocales) ? result.dirtyLocales.map(String) : [],
        draftVersion: typeof result.draftVersion === 'number' ? result.draftVersion : null,
        locales,
        message: message ?? null,
        mode: publishSession.mode,
        versionId: typeof result.versionId === 'string' ? result.versionId : null,
      }
      publishSession.open = false
      isDirty.value = false
      publishSession.message = ''
      resetPublishReadiness()
      studioDebug.debug('publish:success', { collection: collection.value, entryId: entryId.value })
    } catch (e) {
      const errorKey =
        publishSession.mode === 'all'
          ? 'ginkoCms.studio.collectionEditor.publishAllError'
          : 'ginkoCms.studio.collectionEditor.publishError'
      error.value = getCmsErrorMessage(e, t(errorKey))
      resetPublishReadiness('Publish preview changed or expired. Preview again before publishing.')
      studioDebug.error('publish:error', {
        collection: collection.value,
        entryId: entryId.value,
        error: e,
      })
    } finally {
      saving.value = false
    }
  }

  async function unpublishLocales(locales: string[]) {
    if (!canPublishEntries.value) return
    const selectedLocales = [...new Set(locales)].sort()
    if (selectedLocales.length === 0) {
      error.value = 'No public locale is available to unpublish.'
      return
    }
    const targetLabel = _entry.value?.baseSlug ?? entryId.value
    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(api.ginkoCms.editor.previewUnpublishEntryOperation, {
        entryId: entryId.value,
        locales: selectedLocales,
      })) as DestructivePreview
      if (destructivePreviewBlocked(preview)) {
        error.value = destructivePreviewMessage(preview)
        return
      }
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.unpublishError'))
      return
    }
    if (typeof window !== 'undefined') {
      await nextTick()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const ok = await studioConfirm({
        title: t('ginkoCms.common.unpublish'),
        description: destructivePreviewDescription(
          preview,
          formatDestructiveConfirmationPrompt({
            kind: 'unpublish',
            targetLabel,
            targetId: entryId.value,
            previewRequirement: 'target-summary',
            previewState: 'valid',
          }),
        ),
        confirmLabel: t('ginkoCms.common.unpublish'),
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    saving.value = true
    error.value = ''
    studioDebug.debug('unpublish:start', { collection: collection.value, entryId: entryId.value })
    try {
      const token = previewToken(preview)
      if (!token) throw new Error('Preview website changes again before unpublishing.')
      operationValue<null>(
        await unpublishMutation({
          entryId: entryId.value,
          locales: selectedLocales,
          _confirmationToken: token,
        }),
      )
      publishSession.outcome = null
      resetPublishReadiness(
        'Entry was unpublished. Preview website changes before publishing again.',
      )
      studioDebug.debug('unpublish:success', {
        collection: collection.value,
        entryId: entryId.value,
      })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.unpublishError'))
      studioDebug.error('unpublish:error', {
        collection: collection.value,
        entryId: entryId.value,
        error: e,
      })
    } finally {
      saving.value = false
    }
  }

  async function handleUnpublish() {
    await unpublishLocales([currentLocale.value])
  }

  async function handleUnpublishAll() {
    await unpublishLocales(
      localeVariants.value.filter((variant) => variant.published).map((variant) => variant.locale),
    )
  }

  async function handleArchive() {
    if (!canArchiveEntries.value) return
    const targetLabel = _entry.value?.baseSlug ?? entryId.value
    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(api.ginkoCms.editor.previewArchiveEntryOperation, {
        entryId: entryId.value,
      })) as DestructivePreview
      if (destructivePreviewBlocked(preview)) {
        error.value = destructivePreviewMessage(preview)
        return
      }
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.archiveError'))
      return
    }
    if (typeof window !== 'undefined') {
      await nextTick()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const ok = await studioConfirm({
        title: t('ginkoCms.common.archive'),
        description: archiveConfirmDescription(
          preview,
          formatDestructiveConfirmationPrompt({
            kind: 'archive',
            targetLabel,
            targetId: entryId.value,
            previewRequirement: 'target-summary',
            previewState: 'valid',
          }),
          t,
        ),
        confirmLabel: t('ginkoCms.common.archive'),
        // Archive is reversible (restore path in the description), so it gets
        // the neutral primary action — red is reserved for irreversible deletes.
        confirmVariant: 'default',
      })
      if (!ok) return
    }
    saving.value = true
    error.value = ''
    studioDebug.debug('archive:start', { collection: collection.value, entryId: entryId.value })
    try {
      const token = previewToken(preview)
      if (!token) throw new Error('Preview website changes again before archiving.')
      operationValue<null>(
        await archiveMutation({ entryId: entryId.value, _confirmationToken: token }),
      )
      publishSession.outcome = null
      resetPublishReadiness('Entry was archived. Restore it before publishing again.')
      studioDebug.debug('archive:success', { collection: collection.value, entryId: entryId.value })
      await studioDebug.pushWithLogging(
        router,
        `${contentRoute}/${collection.value}`,
        'archive-entry',
        {
          collection: collection.value,
          entryId: entryId.value,
        },
      )
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.archiveError'))
      studioDebug.error('archive:error', {
        collection: collection.value,
        entryId: entryId.value,
        error: e,
      })
    } finally {
      saving.value = false
    }
  }

  async function handleRestore() {
    if (!canArchiveEntries.value) return
    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(api.ginkoCms.editor.previewRestoreEntryOperation, {
        entryId: entryId.value,
      })) as DestructivePreview
      if (destructivePreviewBlocked(preview)) {
        error.value = destructivePreviewMessage(preview)
        return
      }
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.rollbackError'))
      return
    }
    if (typeof window !== 'undefined') {
      await nextTick()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const ok = await studioConfirm({
        title: t('ginkoCms.common.restoreDraft'),
        description: destructivePreviewDescription(
          preview,
          t('ginkoCms.studio.collectionEditor.archivedNoticeDescription'),
        ),
        confirmLabel: t('ginkoCms.common.restoreDraft'),
        confirmVariant: 'default',
      })
      if (!ok) return
    }
    saving.value = true
    error.value = ''
    studioDebug.debug('restore:start', { collection: collection.value, entryId: entryId.value })
    try {
      const token = previewToken(preview)
      if (!token) throw new Error('Preview restore again before continuing.')
      operationValue<null>(
        await restoreMutation({ entryId: entryId.value, _confirmationToken: token }),
      )
      publishSession.outcome = null
      resetPublishReadiness()
      studioDebug.debug('restore:success', { collection: collection.value, entryId: entryId.value })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.rollbackError'))
      studioDebug.error('restore:error', {
        collection: collection.value,
        entryId: entryId.value,
        error: e,
      })
    } finally {
      saving.value = false
    }
  }

  async function handlePermanentDelete() {
    if (!canDeleteEntries.value || _entry.value?.status !== 'archived') return
    const stableId = _entry.value.stableId
    if (!stableId) {
      error.value = t('ginkoCms.studio.collectionEditor.permanentDeleteMissingIdentity')
      return
    }
    const confirmationPhrase = `DELETE ${stableId}`
    const enteredPhrase = await studioPrompt({
      title: t('ginkoCms.studio.collectionEditor.permanentDeleteTitle'),
      description: t('ginkoCms.studio.collectionEditor.permanentDeletePhraseDescription', {
        phrase: confirmationPhrase,
      }),
      label: t('ginkoCms.studio.collectionEditor.permanentDeletePhraseLabel'),
      placeholder: confirmationPhrase,
      confirmLabel: t('ginkoCms.studio.collectionEditor.permanentDeleteReview'),
    })
    if (enteredPhrase === null) return
    if (enteredPhrase !== confirmationPhrase) {
      error.value = t('ginkoCms.studio.collectionEditor.permanentDeletePhraseMismatch')
      return
    }

    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(
        api.ginkoCms.editor.previewPermanentlyDeleteEntryOperation,
        { entryId: entryId.value, confirmationPhrase },
      )) as DestructivePreview
      if (destructivePreviewBlocked(preview)) {
        error.value = destructivePreviewMessage(preview)
        return
      }
    } catch (e) {
      error.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.collectionEditor.permanentDeleteError'),
      )
      return
    }

    const confirmed = await studioConfirm({
      title: t('ginkoCms.studio.collectionEditor.permanentDeleteTitle'),
      description: destructivePreviewDescription(
        preview,
        formatDestructiveConfirmationPrompt({
          kind: 'delete',
          targetLabel: stableId,
          targetId: entryId.value,
          severity: 'critical',
          previewRequirement: 'target-summary',
          previewState: 'valid',
        }),
      ),
      confirmLabel: t('ginkoCms.studio.collectionEditor.permanentDeleteConfirm'),
      confirmVariant: 'destructive',
    })
    if (!confirmed) return

    saving.value = true
    error.value = ''
    studioDebug.debug('permanent-delete:start', {
      collection: collection.value,
      entryId: entryId.value,
      stableId,
    })
    try {
      const token = previewToken(preview)
      if (!token) throw new Error('Preview permanent deletion again before continuing.')
      operationValue(
        await permanentlyDeleteMutation({
          entryId: entryId.value,
          confirmationPhrase,
          _confirmationToken: token,
        }),
      )
      studioDebug.debug('permanent-delete:success', {
        collection: collection.value,
        entryId: entryId.value,
        stableId,
      })
      await studioDebug.pushWithLogging(
        router,
        `${contentRoute}/${collection.value}`,
        'permanently-delete-entry',
        { collection: collection.value, entryId: entryId.value, stableId },
      )
    } catch (e) {
      error.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.collectionEditor.permanentDeleteError'),
      )
      studioDebug.error('permanent-delete:error', {
        collection: collection.value,
        entryId: entryId.value,
        error: e,
      })
    } finally {
      saving.value = false
    }
  }

  return {
    publishSession,
    resetPublishSession,
    setPublishReadiness,
    markPublishReadinessStale,
    handlePublish,
    handlePublishAll,
    confirmPublish,
    handleUnpublish,
    handleUnpublishAll,
    handleArchive,
    handleRestore,
    handlePermanentDelete,
  }
}
