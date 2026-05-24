import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import type { AccessContextBase } from '@lupinum/trellis/auth'

export const defaultCmsMcpCapabilities = {
  readCms: false,
  createEntries: false,
  editEntries: false,
  publishEntries: false,
  archiveEntries: false,
  deleteEntries: false,
  manageCollections: false,
  manageMembers: false,
  manageSettings: false,
  manageAssets: false,
}

export type CmsMcpCapabilities = typeof defaultCmsMcpCapabilities

export type CmsAccessContext = AccessContextBase<Record<string, boolean>> & {
  canBootstrap: boolean
  member: unknown
}

export function getCmsMcpCapabilities(
  accessContext: CmsAccessContext | null | undefined,
): CmsMcpCapabilities {
  if (!accessContext) {
    return { ...defaultCmsMcpCapabilities }
  }

  return {
    readCms: accessContext.can[cmsPermissionKeys.read] === true,
    createEntries: accessContext.can[cmsPermissionKeys.createEntries] === true,
    editEntries: accessContext.can[cmsPermissionKeys.editEntries] === true,
    publishEntries: accessContext.can[cmsPermissionKeys.publishEntries] === true,
    archiveEntries: accessContext.can[cmsPermissionKeys.archiveEntries] === true,
    deleteEntries: accessContext.can[cmsPermissionKeys.deleteEntries] === true,
    manageCollections: accessContext.can[cmsPermissionKeys.manageCollections] === true,
    manageMembers: accessContext.can[cmsPermissionKeys.manageMembers] === true,
    manageSettings: accessContext.can[cmsPermissionKeys.manageSettings] === true,
    manageAssets: accessContext.can[cmsPermissionKeys.manageAssets] === true,
  }
}
