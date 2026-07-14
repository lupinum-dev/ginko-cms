import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'

export const defaultCmsMcpCapabilities = {
  readCms: false,
  createEntries: false,
  editEntries: false,
}

export type CmsMcpCapabilities = typeof defaultCmsMcpCapabilities

export type CmsAccessContext = {
  can: Record<string, boolean>
  permissions?: Record<string, boolean>
  role?: string | null
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
  }
}
