import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'
import type { useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { formatDestructiveConfirmationPrompt } from '../../lib/destructiveWorkflow'
import { derivePublishConfirmationState, type PublishPreviewState } from '../../lib/publicWorkflow'
import { useConvexMutation } from '../useStudioConvex'
import type { useStudioDebug } from '../useStudioDebug'
import type { StudioEntry, StudioField, StudioLocaleVariant } from './types'
import { studioConfirm } from './useStudioConfirm'

interface PublishOperationPreviewState {
  state: PublishPreviewState
  message: string
  confirmationToken: string | null
  confirmationExpiresAt: number | null
  locales: string[]
}

export interface PublishOutcomeState {
  dirtyLocales: string[]
  draftVersion: number | null
  locales: string[]
  message: string | null
  mode: 'single' | 'all'
  versionId: string | null
}

type DestructivePreview = {
  allowed: boolean
  summary: string
  blockers: Array<{ message: string }>
  warnings: Array<{ message: string }>
  confirmation?: { token: string; expiresAt: number }
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
  saving: Ref<boolean>
  error: Ref<string>
  isDirty: Ref<boolean>
  form: { slug: string }
  handleSaveDraft: (silent?: boolean) => Promise<boolean>
  buildSharedData: () => Record<string, unknown> | undefined
  buildLocalizedData: (source: Record<string, unknown>) => Record<string, unknown> | undefined
  dataFields: Record<string, unknown>
  studioDebug: ReturnType<typeof useStudioDebug>
  t: (key: string) => string
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
    saving,
    error,
    isDirty,
    form,
    handleSaveDraft,
    studioDebug,
    t,
  } = deps
  const studioHost = useStudioHostContext()

  const showPublishDialog = ref(false)
  const publishMessage = ref('')
  const publishMode = ref<'single' | 'all'>('single')
  const publishOutcome = ref<PublishOutcomeState | null>(null)
  const publishReadiness = ref<PublishOperationPreviewState>({
    state: 'not_previewed',
    message: 'Preview website changes before publishing.',
    confirmationToken: null,
    confirmationExpiresAt: null,
    locales: [],
  })

  const publishMutation = useConvexMutation(api.ginkoCms.editor.publishEntry)
  const unpublishMutation = useConvexMutation(api.ginkoCms.editor.unpublishEntry)
  const archiveMutation = useConvexMutation(api.ginkoCms.editor.archiveEntry)
  const restoreMutation = useConvexMutation(api.ginkoCms.editor.restoreEntry)

  function convexClient() {
    return studioHost.requireConvexClient()
  }

  function setPublishReadiness(
    next: Omit<PublishOperationPreviewState, 'confirmationToken' | 'confirmationExpiresAt'> &
      Partial<Pick<PublishOperationPreviewState, 'confirmationToken' | 'confirmationExpiresAt'>>,
  ) {
    if (next.state === 'pending') publishOutcome.value = null
    publishReadiness.value = {
      ...next,
      confirmationToken: next.confirmationToken ?? null,
      confirmationExpiresAt: next.confirmationExpiresAt ?? null,
    }
  }

  function resetPublishReadiness(message = 'Preview website changes before publishing.') {
    publishReadiness.value = {
      state: 'not_previewed',
      message,
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
    }
  }

  function markPublishReadinessStale(message = 'Draft changed after the last publish preview.') {
    publishOutcome.value = null
    if (publishReadiness.value.state === 'ready' || publishReadiness.value.state === 'blocked') {
      publishReadiness.value = {
        ...publishReadiness.value,
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
    publishMode.value = 'single'
    showPublishDialog.value = true
    return true
  }

  function handlePublishAll() {
    if (!canPublishEntries.value) return false
    publishMode.value = 'all'
    showPublishDialog.value = true
    return true
  }

  async function confirmPublish() {
    if (!canPublishEntries.value) return
    const publishConfirmation = derivePublishConfirmationState({
      readinessState: publishReadiness.value.state,
      t: deps.t,
      confirmationToken: publishReadiness.value.confirmationToken,
      confirmationExpiresAt: publishReadiness.value.confirmationExpiresAt,
    })
    if (!publishConfirmation.canConfirm) {
      error.value =
        publishConfirmation.disabledReason ?? 'Preview website changes before publishing.'
      return
    }
    saving.value = true
    error.value = ''
    const locales =
      publishMode.value === 'all'
        ? publishReadiness.value.locales.length > 0
          ? publishReadiness.value.locales
          : localeVariants.value.map((variant) => variant.locale)
        : [currentLocale.value]
    const message = publishMessage.value.trim() || undefined
    studioDebug.debug('publish:start', {
      collection: collection.value,
      entryId: entryId.value,
      slug: form.slug,
      mode: publishMode.value,
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
      const expectedVersion = _entry.value?.draftVersion
      if (typeof expectedVersion !== 'number') {
        throw new TypeError('The saved draft is not loaded. Reload before publishing.')
      }
      const result = await publishMutation({
        entryId: entryId.value,
        locales,
        message,
        expectedVersion,
        _confirmationToken: token,
      })
      publishOutcome.value = {
        dirtyLocales: Array.isArray(result.dirtyLocales) ? result.dirtyLocales.map(String) : [],
        draftVersion: typeof result.draftVersion === 'number' ? result.draftVersion : null,
        locales,
        message: message ?? null,
        mode: publishMode.value,
        versionId: typeof result.versionId === 'string' ? result.versionId : null,
      }
      showPublishDialog.value = false
      isDirty.value = false
      publishMessage.value = ''
      resetPublishReadiness()
      studioDebug.debug('publish:success', { collection: collection.value, entryId: entryId.value })
    } catch (e) {
      const errorKey =
        publishMode.value === 'all'
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

  async function handleUnpublish() {
    if (!canPublishEntries.value) return
    const targetLabel = _entry.value?.baseSlug ?? entryId.value
    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(api.ginkoCms.editor.previewUnpublishEntryOperation, {
        entryId: entryId.value,
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
      await unpublishMutation({ entryId: entryId.value, _confirmationToken: token })
      publishOutcome.value = null
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
        description: destructivePreviewDescription(
          preview,
          formatDestructiveConfirmationPrompt({
            kind: 'archive',
            targetLabel,
            targetId: entryId.value,
            previewRequirement: 'target-summary',
            previewState: 'valid',
          }),
        ),
        confirmLabel: t('ginkoCms.common.archive'),
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    saving.value = true
    error.value = ''
    studioDebug.debug('archive:start', { collection: collection.value, entryId: entryId.value })
    try {
      const token = previewToken(preview)
      if (!token) throw new Error('Preview website changes again before archiving.')
      await archiveMutation({ entryId: entryId.value, _confirmationToken: token })
      publishOutcome.value = null
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

  // Restore is a plain non-destructive mutation (archived -> draft), so unlike
  // archive/unpublish it needs no preview token and no confirmation dialog.
  async function handleRestore() {
    if (!canArchiveEntries.value) return
    saving.value = true
    error.value = ''
    studioDebug.debug('restore:start', { collection: collection.value, entryId: entryId.value })
    try {
      await restoreMutation({ entryId: entryId.value })
      publishOutcome.value = null
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

  return {
    showPublishDialog,
    publishMessage,
    publishMode,
    publishOutcome,
    publishReadiness,
    setPublishReadiness,
    markPublishReadinessStale,
    handlePublish,
    handlePublishAll,
    confirmPublish,
    handleUnpublish,
    handleArchive,
    handleRestore,
  }
}
