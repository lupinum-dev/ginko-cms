import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { ref, type ComputedRef, type Ref } from 'vue'

import { api } from '../../boundary/api'
import { operationValue } from '../../lib/destructiveWorkflow'
import { useCmsI18n } from '../useCmsI18n'
import { useConvexAction, useConvexMutation, useConvexUpload } from '../useStudioConvex'
import type { FinderAssetRecord } from './assetFinderTypes'
import { getImageDimensions } from './assetFinderUtils'

export type PendingAssetReplacement = {
  asset: FinderAssetRecord
  sessionId: string
  replacementFilename: string
  summary: string
  warnings: Array<{ code?: string; message?: string }>
  details: {
    stableReference: boolean
    metadata: {
      filename: string
      alt: unknown
      caption: unknown
      tags: string[]
      behavior: 'preserved'
    }
    current: {
      mimeType: string
      size: number
      sha256: string
      width: number
      height: number
      frames: number
    }
    replacement: {
      filename: string
      mimeType: string
      size: number
      sha256: string
      width: number
      height: number
      frames: number
    }
    usageCounts: {
      draft: number
      revision: number
      public: number
      publishedEntries: number
    }
    recoveryArtifactId: string
    publicFreshness: string
  }
  confirmation: { token: string; expiresAt: number }
}

export function useStudioAssetReplacement(options: {
  selectedAsset: ComputedRef<FinderAssetRecord | null>
  actionPending: Ref<boolean>
  error: Ref<string>
}) {
  const { t } = useCmsI18n()
  const upload = useConvexUpload(
    api.ginkoCms.assets.createAssetUploadSession,
    api.ginkoCms.assets.claimAssetUploadSession,
    {
      allowedTypes: [...ALLOWED_ASSET_MIME_TYPES],
      maxSizeBytes: MAX_ASSET_SIZE_BYTES,
    },
  )
  const verifyUpload = useConvexAction(api.ginkoCms.assets.verifyAssetReplacementUpload)
  const previewReplacement = useConvexMutation(api.ginkoCms.assets.previewReplaceAssetOperation)
  const executeReplacement = useConvexAction(api.ginkoCms.assets.replaceAsset)
  const replacementInput = ref<HTMLInputElement | null>(null)
  const replacing = ref(false)
  const pendingAssetReplacement = ref<PendingAssetReplacement | null>(null)

  function requestReplaceSelectedAsset() {
    const asset = options.selectedAsset.value
    if (!asset || asset.deletedAt || options.actionPending.value) return
    options.error.value = ''
    if (asset.referenceCertainty.state === 'unknown-stale') {
      options.error.value = t('ginkoCms.studio.assetBrowser.replaceReferenceVerificationRequired')
      return
    }
    if (replacementInput.value) replacementInput.value.value = ''
    replacementInput.value?.click()
  }

  async function handleReplacementUpload(event: Event) {
    const target = event.target as HTMLInputElement | null
    const file = target?.files?.[0]
    const asset = options.selectedAsset.value
    if (!file || !asset) return
    options.actionPending.value = true
    replacing.value = true
    options.error.value = ''
    try {
      if (file.type !== asset.mimeType) {
        throw new Error(
          t('ginkoCms.studio.assetBrowser.replaceTypeMismatch', {
            current: asset.mimeType,
          }),
        )
      }
      const dimensions = await getImageDimensions(file)
      if (
        asset.width !== null &&
        asset.height !== null &&
        (dimensions.width !== asset.width || dimensions.height !== asset.height)
      ) {
        throw new Error(
          t('ginkoCms.studio.assetBrowser.replaceDimensionsMismatch', {
            width: asset.width,
            height: asset.height,
          }),
        )
      }
      const uploaded = await upload.upload(file)
      if (Array.isArray(uploaded)) {
        throw new TypeError('Single-file replacement returned multiple upload sessions.')
      }
      const staged = await verifyUpload({
        assetId: asset.id,
        sessionId: uploaded.sessionId,
        token: uploaded.token,
        filename: file.name,
      })
      const preview = await previewReplacement({ assetId: asset.id, sessionId: staged.sessionId })
      if (preview.allowed === false || preview.blockers.length > 0) {
        throw new Error(
          preview.blockers[0]?.message ?? preview.warnings[0]?.message ?? preview.summary,
        )
      }
      if (!preview.confirmation?.token || preview.confirmation.expiresAt <= Date.now()) {
        throw new Error(t('ginkoCms.studio.assetBrowser.replacePreviewExpired'))
      }
      pendingAssetReplacement.value = {
        asset,
        sessionId: staged.sessionId,
        replacementFilename: staged.filename,
        summary: preview.summary,
        warnings: preview.warnings,
        details: preview.details,
        confirmation: preview.confirmation,
      }
    } catch (cause) {
      options.error.value = getCmsErrorMessage(
        cause,
        t('ginkoCms.studio.assetBrowser.replacePrepareError'),
      )
    } finally {
      upload.reset()
      replacing.value = false
      options.actionPending.value = false
      if (replacementInput.value) replacementInput.value.value = ''
    }
  }

  function handleReplacementDialogOpen(open: boolean) {
    if (!open) pendingAssetReplacement.value = null
  }

  async function confirmAssetReplacement() {
    const pending = pendingAssetReplacement.value
    if (!pending || replacing.value) return
    options.actionPending.value = true
    replacing.value = true
    options.error.value = ''
    try {
      operationValue<{
        assetId: string
        recoveryArtifactId: string
        publicEntriesUpdated: number
        revalidationQueued: boolean
      }>(
        await executeReplacement({
          assetId: pending.asset.id,
          sessionId: pending.sessionId,
          _confirmationToken: pending.confirmation.token,
        }),
      )
      pendingAssetReplacement.value = null
    } catch (cause) {
      options.error.value = getCmsErrorMessage(
        cause,
        t('ginkoCms.studio.assetBrowser.replaceError'),
      )
    } finally {
      replacing.value = false
      options.actionPending.value = false
    }
  }

  return {
    replacementInput,
    replacing,
    pendingAssetReplacement,
    requestReplaceSelectedAsset,
    handleReplacementUpload,
    handleReplacementDialogOpen,
    confirmAssetReplacement,
  }
}
