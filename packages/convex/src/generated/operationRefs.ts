// AUTO-GENERATED. Do not edit.
import { projectOperationRef } from '@lupinum/trellis/mcp'

import { api } from '../_generated/api.js'

const __archiveEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.archive-entry',
  name: 'archive-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.archive-entry'>

const __createEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.create-entry',
  name: 'create-entry',
  kind: 'safe',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.create-entry'>

const __deleteAssetOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-asset',
  name: 'delete-asset',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.delete-asset'>

const __deleteBackupArtifactOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-backup-artifact',
  name: 'delete-backup-artifact',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.delete-backup-artifact'>

const __deleteEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-entry',
  name: 'delete-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.delete-entry'>

const __deleteSiteDataBlockOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.delete-site-data-block',
  name: 'delete-site-data-block',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.delete-site-data-block'>

const __moveAssetOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.move-asset',
  name: 'move-asset',
  kind: 'safe',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.move-asset'>

const __publishEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.publish-entry',
  name: 'publish-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.publish-entry'>

const __purgeAssetOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.purge-asset',
  name: 'purge-asset',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.purge-asset'>

const __removeMemberOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.remove-member',
  name: 'remove-member',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.remove-member'>

const __retryRevalidationJobOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.retry-revalidation-job',
  name: 'retry-revalidation-job',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.retry-revalidation-job'>

const __revertDraftToPublishedOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.revert-draft-to-published',
  name: 'revert-draft-to-published',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.revert-draft-to-published'>

const __rollbackVersionOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.rollback-version',
  name: 'rollback-version',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.rollback-version'>

const __saveEntryDraftOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.save-entry-draft',
  name: 'save-entry-draft',
  kind: 'safe',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.save-entry-draft'>

const __unarchiveEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.unarchive-entry',
  name: 'unarchive-entry',
  kind: 'safe',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.unarchive-entry'>

const __unpublishEntryOperationDescriptor = {
  _type: 'operation-descriptor',
  id: 'ginko-cms.unpublish-entry',
  name: 'unpublish-entry',
  kind: 'destructive',
  args: {},
} as unknown as import('@lupinum/trellis/mcp').OperationDescriptor<'ginko-cms.unpublish-entry'>

export const ginkoCmsArchiveEntryExecuteRef = projectOperationRef(
  __archiveEntryOperationDescriptor,
  'execute',
  api.entries.publish.archiveEntryOperationExecute,
  { functionRef: 'entries/publish:archiveEntryOperationExecute' },
)

export const ginkoCmsArchiveEntryPreviewRef = projectOperationRef(
  __archiveEntryOperationDescriptor,
  'preview',
  api.entries.publish.previewArchiveEntryOperation,
  {
    functionRef: 'editor:previewArchiveEntryOperation',
    executeFunctionRef: 'entries/publish:archiveEntryOperationExecute',
  },
)

export const ginkoCmsCreateEntryExecuteRef = projectOperationRef(
  __createEntryOperationDescriptor,
  'execute',
  api.entries.tree.createEntry,
  { functionRef: 'ginko-cms.create-entry' },
)

export const ginkoCmsDeleteAssetExecuteRef = projectOperationRef(
  __deleteAssetOperationDescriptor,
  'execute',
  api.assets.deleteAssetOperationExecute,
  { functionRef: 'assets:deleteAssetOperationExecute' },
)

export const ginkoCmsDeleteAssetPreviewRef = projectOperationRef(
  __deleteAssetOperationDescriptor,
  'preview',
  api.assets.previewDeleteAssetOperation,
  {
    functionRef: 'assets:previewDeleteAssetOperation',
    executeFunctionRef: 'assets:deleteAssetOperationExecute',
  },
)

export const ginkoCmsDeleteBackupArtifactExecuteRef = projectOperationRef(
  __deleteBackupArtifactOperationDescriptor,
  'execute',
  api.backup.deleteBackupArtifactOperationExecute,
  { functionRef: 'backup:deleteBackupArtifactOperationExecute' },
)

export const ginkoCmsDeleteBackupArtifactPreviewRef = projectOperationRef(
  __deleteBackupArtifactOperationDescriptor,
  'preview',
  api.backup.previewDeleteBackupArtifactOperation,
  {
    functionRef: 'backup:previewDeleteBackupArtifactOperation',
    executeFunctionRef: 'backup:deleteBackupArtifactOperationExecute',
  },
)

export const ginkoCmsDeleteEntryExecuteRef = projectOperationRef(
  __deleteEntryOperationDescriptor,
  'execute',
  api.entries.tree.deleteEntryOperationExecute,
  { functionRef: 'entries/tree:deleteEntryOperationExecute' },
)

export const ginkoCmsDeleteEntryPreviewRef = projectOperationRef(
  __deleteEntryOperationDescriptor,
  'preview',
  api.entries.tree.previewDeleteEntryOperation,
  {
    functionRef: 'editor:previewDeleteEntryOperation',
    executeFunctionRef: 'entries/tree:deleteEntryOperationExecute',
  },
)

export const ginkoCmsDeleteSiteDataBlockExecuteRef = projectOperationRef(
  __deleteSiteDataBlockOperationDescriptor,
  'execute',
  api.siteData.deleteSiteDataBlockOperationExecute,
  { functionRef: 'siteData:deleteSiteDataBlockOperationExecute' },
)

export const ginkoCmsDeleteSiteDataBlockPreviewRef = projectOperationRef(
  __deleteSiteDataBlockOperationDescriptor,
  'preview',
  api.siteData.previewDeleteSiteDataBlockOperation,
  {
    functionRef: 'siteData:previewDeleteSiteDataBlockOperation',
    executeFunctionRef: 'siteData:deleteSiteDataBlockOperationExecute',
  },
)

export const ginkoCmsMoveAssetExecuteRef = projectOperationRef(
  __moveAssetOperationDescriptor,
  'execute',
  api.assets.moveAsset,
  { functionRef: 'ginko-cms.move-asset' },
)

export const ginkoCmsPublishEntryExecuteRef = projectOperationRef(
  __publishEntryOperationDescriptor,
  'execute',
  api.entries.publish.publishEntryOperationExecute,
  { functionRef: 'entries/publish:publishEntryOperationExecute' },
)

export const ginkoCmsPublishEntryPreviewRef = projectOperationRef(
  __publishEntryOperationDescriptor,
  'preview',
  api.entries.publish.previewPublishEntryOperation,
  {
    functionRef: 'editor:previewPublishEntryOperation',
    executeFunctionRef: 'entries/publish:publishEntryOperationExecute',
  },
)

export const ginkoCmsPurgeAssetExecuteRef = projectOperationRef(
  __purgeAssetOperationDescriptor,
  'execute',
  api.assets.purgeAsset,
  { functionRef: 'assets:purgeAsset' },
)

export const ginkoCmsPurgeAssetPreviewRef = projectOperationRef(
  __purgeAssetOperationDescriptor,
  'preview',
  api.assets.previewPurgeAssetOperation,
  {
    functionRef: 'assets:previewPurgeAssetOperation',
    executeFunctionRef: 'assets:purgeAsset',
  },
)

export const ginkoCmsRemoveMemberExecuteRef = projectOperationRef(
  __removeMemberOperationDescriptor,
  'execute',
  api.members.removeMemberOperationExecute,
  { functionRef: 'members:removeMemberOperationExecute' },
)

export const ginkoCmsRemoveMemberPreviewRef = projectOperationRef(
  __removeMemberOperationDescriptor,
  'preview',
  api.members.previewRemoveMemberOperation,
  {
    functionRef: 'members:previewRemoveMemberOperation',
    executeFunctionRef: 'members:removeMemberOperationExecute',
  },
)

export const ginkoCmsRetryRevalidationJobExecuteRef = projectOperationRef(
  __retryRevalidationJobOperationDescriptor,
  'execute',
  api.revalidation.retryRevalidationJobOperationExecute,
  { functionRef: 'revalidation:retryRevalidationJobOperationExecute' },
)

export const ginkoCmsRetryRevalidationJobPreviewRef = projectOperationRef(
  __retryRevalidationJobOperationDescriptor,
  'preview',
  api.revalidation.previewRetryRevalidationJobOperation,
  {
    functionRef: 'revalidation:previewRetryRevalidationJobOperation',
    executeFunctionRef: 'revalidation:retryRevalidationJobOperationExecute',
  },
)

export const ginkoCmsRevertDraftToPublishedExecuteRef = projectOperationRef(
  __revertDraftToPublishedOperationDescriptor,
  'execute',
  api.entries.draft.revertDraftToPublishedOperationExecute,
  { functionRef: 'entries/draft:revertDraftToPublishedOperationExecute' },
)

export const ginkoCmsRevertDraftToPublishedPreviewRef = projectOperationRef(
  __revertDraftToPublishedOperationDescriptor,
  'preview',
  api.entries.draft.previewRevertDraftToPublishedOperation,
  {
    functionRef: 'editor:previewRevertDraftToPublishedOperation',
    executeFunctionRef: 'entries/draft:revertDraftToPublishedOperationExecute',
  },
)

export const ginkoCmsRollbackVersionExecuteRef = projectOperationRef(
  __rollbackVersionOperationDescriptor,
  'execute',
  api.entries.publish.rollbackVersionOperationExecute,
  { functionRef: 'entries/publish:rollbackVersionOperationExecute' },
)

export const ginkoCmsRollbackVersionPreviewRef = projectOperationRef(
  __rollbackVersionOperationDescriptor,
  'preview',
  api.entries.publish.previewRollbackVersionOperation,
  {
    functionRef: 'editor:previewRollbackVersionOperation',
    executeFunctionRef: 'entries/publish:rollbackVersionOperationExecute',
  },
)

export const ginkoCmsSaveEntryDraftExecuteRef = projectOperationRef(
  __saveEntryDraftOperationDescriptor,
  'execute',
  api.entries.draft.saveEntryDraft,
  { functionRef: 'ginko-cms.save-entry-draft' },
)

export const ginkoCmsUnarchiveEntryExecuteRef = projectOperationRef(
  __unarchiveEntryOperationDescriptor,
  'execute',
  api.entries.publish.unarchiveEntry,
  { functionRef: 'ginko-cms.unarchive-entry' },
)

export const ginkoCmsUnpublishEntryExecuteRef = projectOperationRef(
  __unpublishEntryOperationDescriptor,
  'execute',
  api.entries.publish.unpublishEntryOperationExecute,
  { functionRef: 'entries/publish:unpublishEntryOperationExecute' },
)

export const ginkoCmsUnpublishEntryPreviewRef = projectOperationRef(
  __unpublishEntryOperationDescriptor,
  'preview',
  api.entries.publish.previewUnpublishEntryOperation,
  {
    functionRef: 'editor:previewUnpublishEntryOperation',
    executeFunctionRef: 'entries/publish:unpublishEntryOperationExecute',
  },
)
