import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { formatDestructiveConfirmationPrompt } from '../../lib/destructiveWorkflow'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexMutation } from '../useStudioConvex'
import type { useStudioDebug } from '../useStudioDebug'
import type { StudioAssetRecord, StudioEntry } from './types'
import { studioConfirm } from './useStudioConfirm'

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

function previewToken(preview: DestructivePreview | null): string | null {
  if (!preview || destructivePreviewBlocked(preview)) return null
  if (!preview.confirmation?.token) return null
  if (preview.confirmation.expiresAt <= Date.now()) return null
  return preview.confirmation.token
}

interface EntryHistoryDeps {
  entry: Ref<StudioEntry | null>
  entryId: Ref<string>
  collection: Ref<string>
  canEditEntries: Ref<boolean>
  canPublishEntries: Ref<boolean>
  saving: Ref<boolean>
  error: Ref<string>
  requestHydrate: () => void
  handleSaveDraft: (silent?: boolean) => Promise<boolean>
  studioDebug: ReturnType<typeof useStudioDebug>
  t: (key: string) => string
}

export function useEntryHistory(deps: EntryHistoryDeps) {
  const studioHost = useStudioHostContext()
  const {
    entry,
    entryId,
    collection,
    canEditEntries,
    canPublishEntries,
    saving,
    error,
    requestHydrate,
    handleSaveDraft,
    studioDebug,
    t,
  } = deps

  const versionsQueryArgs = computed(() => (entry.value ? { entryId: entryId.value } : null))
  const versionsQuery = useCmsStudioQuery(api.ginkoCms.editor.listVersions, versionsQueryArgs)
  const versions = computed(() => versionsQuery.data?.value ?? [])

  const entryAssetsQuery = useCmsStudioQuery(
    api.ginkoCms.assets.listColocatedAssets,
    computed(() =>
      entry.value
        ? {
            collectionSlug: collection.value,
            entryId: entryId.value,
          }
        : null,
    ),
  )
  const entryAssets = computed<StudioAssetRecord[]>(
    () =>
      (
        (entryAssetsQuery.data?.value as { entry?: Array<Record<string, unknown>> } | undefined)
          ?.entry ?? []
      ).map((asset) => ({
        ...asset,
        _id: String(asset.id ?? asset._id ?? ''),
        filename: String(asset.filename ?? ''),
        mimeType: String(asset.mimeType ?? 'application/octet-stream'),
        size: typeof asset.size === 'number' ? asset.size : 0,
      })) as StudioAssetRecord[],
  )

  const entryActivityQuery = useCmsStudioQuery(
    api.ginkoCms.editor.getEntryActivity,
    computed(() => (entry.value ? { entryId: entryId.value } : null)),
  )
  const entryActivity = computed(() => entryActivityQuery.data?.value ?? [])

  const previewVersionId = ref<string | null>(null)

  function toggleVersionPreview(versionId: string) {
    previewVersionId.value = previewVersionId.value === versionId ? null : versionId
  }

  const diffLeftVersionId = ref<string | null>(null)
  const diffQuery = useCmsStudioQuery(
    api.ginkoCms.editor.getVersionDiff,
    computed(() => {
      if (!diffLeftVersionId.value || versions.value.length < 1) return null
      const latest = versions.value[0]
      if (!latest) return null
      return {
        leftVersionId: diffLeftVersionId.value,
        rightVersionId: latest._id,
      }
    }),
  )
  const versionDiff = computed(() => diffQuery.data?.value ?? null)

  function toggleDiff(versionId: string) {
    diffLeftVersionId.value = diffLeftVersionId.value === versionId ? null : versionId
  }

  const rollbackVersionMutation = useConvexMutation(api.ginkoCms.editor.rollbackVersion)
  const checkpointMutation = useConvexMutation(api.ginkoCms.editor.createCheckpoint)

  function convexClient() {
    return studioHost.requireConvexClient()
  }

  async function handleRollback(versionId: string, publish = false) {
    if (!canEditEntries.value || (publish && !canPublishEntries.value)) {
      return
    }
    let preview: DestructivePreview | null = null
    try {
      preview = (await convexClient().mutation(
        api.ginkoCms.editor.previewRollbackVersionOperation,
        {
          entryId: entryId.value,
          versionId,
          ...(publish ? { publish: true } : {}),
        },
      )) as DestructivePreview
      if (destructivePreviewBlocked(preview)) {
        error.value = destructivePreviewMessage(preview)
        return
      }
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.rollbackError'))
      return
    }
    if (typeof window !== 'undefined') {
      const ok = await studioConfirm({
        title: publish ? 'Restore and publish this version?' : 'Restore this version as draft?',
        description: destructivePreviewDescription(
          preview,
          formatDestructiveConfirmationPrompt({
            kind: 'rollback',
            targetLabel: entry.value?.baseSlug ?? entryId.value,
            targetId: versionId,
            previewRequirement: 'draft-diff',
            previewState: 'valid',
            previewLabel: publish ? 'version diff and publish target' : 'version diff',
            warning: publish
              ? t('ginkoCms.studio.collectionEditor.rollbackPublishPrompt')
              : t('ginkoCms.studio.collectionEditor.rollbackDraftPrompt'),
          }),
        ),
        confirmLabel: publish ? 'Restore & publish' : 'Restore as draft',
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    const target = publish ? 'restoreAndPublish' : 'restoreAsDraft'
    studioDebug.debug(`version:${target}:start`, { entryId: entryId.value, versionId })
    saving.value = true
    error.value = ''
    try {
      const saved = await handleSaveDraft(true)
      if (!saved) {
        if (!error.value) error.value = t('ginkoCms.studio.collectionEditor.saveDraftError')
        return
      }
      requestHydrate()
      studioDebug.debug(`version:${target}:requestingHydrateBefore`, { entryId: entryId.value })
      const token = previewToken(preview)
      if (!token) throw new Error('Preview this saved version again before restoring it.')
      const result = await rollbackVersionMutation({
        entryId: entryId.value,
        versionId,
        ...(publish ? { publish: true } : {}),
        _confirmationToken: token,
      })
      previewVersionId.value = null
      diffLeftVersionId.value = null
      studioDebug.debug(`version:${target}:success`, {
        entryId: entryId.value,
        versionId,
        result,
      })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.rollbackError'))
      studioDebug.error(`version:${target}:error`, {
        entryId: entryId.value,
        versionId,
        error: e,
      })
    } finally {
      saving.value = false
      studioDebug.debug(`version:${target}:done`, { entryId: entryId.value, saving: false })
    }
  }

  // --- Checkpoint ---
  const showCheckpointDialog = ref(false)
  const checkpointMessage = ref('')

  async function handleCreateCheckpoint() {
    if (!canEditEntries.value) return
    const message = checkpointMessage.value.trim()
    if (!message) return
    studioDebug.debug('checkpoint:start', { entryId: entryId.value })
    saving.value = true
    error.value = ''
    try {
      const saved = await handleSaveDraft(true)
      if (!saved) return
      await checkpointMutation({ entryId: entryId.value, message })
      studioDebug.debug('checkpoint:success', { entryId: entryId.value, message })
      showCheckpointDialog.value = false
      checkpointMessage.value = ''
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.checkpointError'))
      studioDebug.error('checkpoint:error', { entryId: entryId.value, error: e })
    } finally {
      saving.value = false
    }
  }

  return {
    versions,
    entryAssets,
    entryActivity,
    previewVersionId,
    toggleVersionPreview,
    diffLeftVersionId,
    versionDiff,
    toggleDiff,
    handleRollback,
    showCheckpointDialog,
    checkpointMessage,
    handleCreateCheckpoint,
  }
}
