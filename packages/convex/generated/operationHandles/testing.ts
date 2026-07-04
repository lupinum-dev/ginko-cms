// AUTO-GENERATED. Do not edit.
import { defineOperationHandle } from '../../src/operationHelpers.js'
import {
  ginkoCmsArchiveEntryExecuteRef,
  ginkoCmsArchiveEntryPreviewRef,
  ginkoCmsCreateEntryExecuteRef,
  ginkoCmsDeleteAssetExecuteRef,
  ginkoCmsDeleteAssetPreviewRef,
  ginkoCmsDeleteBackupArtifactExecuteRef,
  ginkoCmsDeleteBackupArtifactPreviewRef,
  ginkoCmsDeleteEntryExecuteRef,
  ginkoCmsDeleteEntryPreviewRef,
  ginkoCmsDeleteSiteDataBlockExecuteRef,
  ginkoCmsDeleteSiteDataBlockPreviewRef,
  ginkoCmsMoveAssetExecuteRef,
  ginkoCmsPublishEntryExecuteRef,
  ginkoCmsPublishEntryPreviewRef,
  ginkoCmsPurgeAssetExecuteRef,
  ginkoCmsPurgeAssetPreviewRef,
  ginkoCmsRemoveMemberExecuteRef,
  ginkoCmsRemoveMemberPreviewRef,
  ginkoCmsRetryRevalidationJobExecuteRef,
  ginkoCmsRetryRevalidationJobPreviewRef,
  ginkoCmsRevertDraftToPublishedExecuteRef,
  ginkoCmsRevertDraftToPublishedPreviewRef,
  ginkoCmsRollbackVersionExecuteRef,
  ginkoCmsRollbackVersionPreviewRef,
  ginkoCmsSaveEntryDraftExecuteRef,
  ginkoCmsUnarchiveEntryExecuteRef,
  ginkoCmsUnpublishEntryExecuteRef,
  ginkoCmsUnpublishEntryPreviewRef,
} from '../operationRefs.js'

const __archiveEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.archive-entry',
  name: 'archive-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.archive-entry'>

export const archiveEntryHandle = defineOperationHandle(__archiveEntryHandleDescriptor, {
  executeRef: ginkoCmsArchiveEntryExecuteRef,
  previewRef: ginkoCmsArchiveEntryPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __createEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.create-entry',
  name: 'create-entry',
  kind: 'safe',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.create-entry'>

export const createEntryHandle = defineOperationHandle(__createEntryHandleDescriptor, {
  executeRef: ginkoCmsCreateEntryExecuteRef,
  executeOperation: 'mutation',
  runtimes: ['testing'],
})

const __deleteAssetHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-asset',
  name: 'delete-asset',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.delete-asset'>

export const deleteAssetHandle = defineOperationHandle(__deleteAssetHandleDescriptor, {
  executeRef: ginkoCmsDeleteAssetExecuteRef,
  previewRef: ginkoCmsDeleteAssetPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __deleteBackupArtifactHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-backup-artifact',
  name: 'delete-backup-artifact',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.delete-backup-artifact'>

export const deleteBackupArtifactHandle = defineOperationHandle(
  __deleteBackupArtifactHandleDescriptor,
  {
    executeRef: ginkoCmsDeleteBackupArtifactExecuteRef,
    previewRef: ginkoCmsDeleteBackupArtifactPreviewRef,
    executeOperation: 'mutation',
    previewOperation: 'mutation',
    runtimes: ['testing'],
  },
)

const __deleteEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-entry',
  name: 'delete-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.delete-entry'>

export const deleteEntryHandle = defineOperationHandle(__deleteEntryHandleDescriptor, {
  executeRef: ginkoCmsDeleteEntryExecuteRef,
  previewRef: ginkoCmsDeleteEntryPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __deleteSiteDataBlockHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-site-data-block',
  name: 'delete-site-data-block',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.delete-site-data-block'>

export const deleteSiteDataBlockHandle = defineOperationHandle(
  __deleteSiteDataBlockHandleDescriptor,
  {
    executeRef: ginkoCmsDeleteSiteDataBlockExecuteRef,
    previewRef: ginkoCmsDeleteSiteDataBlockPreviewRef,
    executeOperation: 'mutation',
    previewOperation: 'mutation',
    runtimes: ['testing'],
  },
)

const __moveAssetHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.move-asset',
  name: 'move-asset',
  kind: 'safe',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.move-asset'>

export const moveAssetHandle = defineOperationHandle(__moveAssetHandleDescriptor, {
  executeRef: ginkoCmsMoveAssetExecuteRef,
  executeOperation: 'mutation',
  runtimes: ['testing'],
})

const __publishEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.publish-entry',
  name: 'publish-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.publish-entry'>

export const publishEntryHandle = defineOperationHandle(__publishEntryHandleDescriptor, {
  executeRef: ginkoCmsPublishEntryExecuteRef,
  previewRef: ginkoCmsPublishEntryPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __purgeAssetHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.purge-asset',
  name: 'purge-asset',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.purge-asset'>

export const purgeAssetHandle = defineOperationHandle(__purgeAssetHandleDescriptor, {
  executeRef: ginkoCmsPurgeAssetExecuteRef,
  previewRef: ginkoCmsPurgeAssetPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __removeMemberHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.remove-member',
  name: 'remove-member',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.remove-member'>

export const removeMemberHandle = defineOperationHandle(__removeMemberHandleDescriptor, {
  executeRef: ginkoCmsRemoveMemberExecuteRef,
  previewRef: ginkoCmsRemoveMemberPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __retryRevalidationJobHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.retry-revalidation-job',
  name: 'retry-revalidation-job',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.retry-revalidation-job'>

export const retryRevalidationJobHandle = defineOperationHandle(
  __retryRevalidationJobHandleDescriptor,
  {
    executeRef: ginkoCmsRetryRevalidationJobExecuteRef,
    previewRef: ginkoCmsRetryRevalidationJobPreviewRef,
    executeOperation: 'mutation',
    previewOperation: 'mutation',
    runtimes: ['testing'],
  },
)

const __revertDraftToPublishedHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.revert-draft-to-published',
  name: 'revert-draft-to-published',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.revert-draft-to-published'>

export const revertDraftToPublishedHandle = defineOperationHandle(
  __revertDraftToPublishedHandleDescriptor,
  {
    executeRef: ginkoCmsRevertDraftToPublishedExecuteRef,
    previewRef: ginkoCmsRevertDraftToPublishedPreviewRef,
    executeOperation: 'mutation',
    previewOperation: 'mutation',
    runtimes: ['testing'],
  },
)

const __rollbackVersionHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.rollback-version',
  name: 'rollback-version',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.rollback-version'>

export const rollbackVersionHandle = defineOperationHandle(__rollbackVersionHandleDescriptor, {
  executeRef: ginkoCmsRollbackVersionExecuteRef,
  previewRef: ginkoCmsRollbackVersionPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

const __saveEntryDraftHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.save-entry-draft',
  name: 'save-entry-draft',
  kind: 'safe',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.save-entry-draft'>

export const saveEntryDraftHandle = defineOperationHandle(__saveEntryDraftHandleDescriptor, {
  executeRef: ginkoCmsSaveEntryDraftExecuteRef,
  executeOperation: 'mutation',
  runtimes: ['testing'],
})

const __unarchiveEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.unarchive-entry',
  name: 'unarchive-entry',
  kind: 'safe',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.unarchive-entry'>

export const unarchiveEntryHandle = defineOperationHandle(__unarchiveEntryHandleDescriptor, {
  executeRef: ginkoCmsUnarchiveEntryExecuteRef,
  executeOperation: 'mutation',
  runtimes: ['testing'],
})

const __unpublishEntryHandleDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.unpublish-entry',
  name: 'unpublish-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('../../src/operationHelpers.js').OperationDescriptor<'ginko-cms.unpublish-entry'>

export const unpublishEntryHandle = defineOperationHandle(__unpublishEntryHandleDescriptor, {
  executeRef: ginkoCmsUnpublishEntryExecuteRef,
  previewRef: ginkoCmsUnpublishEntryPreviewRef,
  executeOperation: 'mutation',
  previewOperation: 'mutation',
  runtimes: ['testing'],
})

export const operations = {
  byId: {
    'ginko-cms.archive-entry': archiveEntryHandle,
    'ginko-cms.create-entry': createEntryHandle,
    'ginko-cms.delete-asset': deleteAssetHandle,
    'ginko-cms.delete-backup-artifact': deleteBackupArtifactHandle,
    'ginko-cms.delete-entry': deleteEntryHandle,
    'ginko-cms.delete-site-data-block': deleteSiteDataBlockHandle,
    'ginko-cms.move-asset': moveAssetHandle,
    'ginko-cms.publish-entry': publishEntryHandle,
    'ginko-cms.purge-asset': purgeAssetHandle,
    'ginko-cms.remove-member': removeMemberHandle,
    'ginko-cms.retry-revalidation-job': retryRevalidationJobHandle,
    'ginko-cms.revert-draft-to-published': revertDraftToPublishedHandle,
    'ginko-cms.rollback-version': rollbackVersionHandle,
    'ginko-cms.save-entry-draft': saveEntryDraftHandle,
    'ginko-cms.unarchive-entry': unarchiveEntryHandle,
    'ginko-cms.unpublish-entry': unpublishEntryHandle,
  },
  ...{
    ginkoCms: {
      archiveEntry: archiveEntryHandle,
      createEntry: createEntryHandle,
      deleteAsset: deleteAssetHandle,
      deleteBackupArtifact: deleteBackupArtifactHandle,
      deleteEntry: deleteEntryHandle,
      deleteSiteDataBlock: deleteSiteDataBlockHandle,
      moveAsset: moveAssetHandle,
      publishEntry: publishEntryHandle,
      purgeAsset: purgeAssetHandle,
      removeMember: removeMemberHandle,
      retryRevalidationJob: retryRevalidationJobHandle,
      revertDraftToPublished: revertDraftToPublishedHandle,
      rollbackVersion: rollbackVersionHandle,
      saveEntryDraft: saveEntryDraftHandle,
      unarchiveEntry: unarchiveEntryHandle,
      unpublishEntry: unpublishEntryHandle,
    },
  },
}
