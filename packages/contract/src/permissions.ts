export const cmsPermissionKeys = {
  read: 'cms.read',
  bootstrap: 'cms.bootstrap',
  createEntries: 'cms.entries.create',
  editEntries: 'cms.entries.edit',
  publishEntries: 'cms.entries.publish',
  archiveEntries: 'cms.entries.archive',
  deleteEntries: 'cms.entries.delete',
  manageCollections: 'cms.collections.manage',
  manageSettings: 'cms.settings.manage',
  manageMembers: 'cms.members.manage',
  manageAssets: 'cms.assets.manage',
  manageBackups: 'cms.backups.manage',
  managePortability: 'cms.portability.manage',
} as const

export type CmsPermissionKey = (typeof cmsPermissionKeys)[keyof typeof cmsPermissionKeys]

export const mcpCredentialScopeKeys = [
  cmsPermissionKeys.read,
  cmsPermissionKeys.createEntries,
  cmsPermissionKeys.editEntries,
] as const

export type CmsPermissionMap = Record<CmsPermissionKey, boolean>
