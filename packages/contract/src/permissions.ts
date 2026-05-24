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
} as const

export type CmsPermissionKey = (typeof cmsPermissionKeys)[keyof typeof cmsPermissionKeys]

export type CmsPermissionMap = Record<CmsPermissionKey, boolean>
