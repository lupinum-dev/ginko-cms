import type { CmsPermissionKey } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import {
  cmsPermissionKeys,
  mcpDelegatedScopeKeys,
} from '@lupinum/ginko-cms-contract/shared/permissions.js'
import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { CmsAppIdentity } from './appIdentity.js'

export type CmsGuard = {
  label: string
  permission?: CmsPermissionKey
  check: (appIdentity: CmsAppIdentity) => boolean
  or: (other: CmsGuard) => CmsGuard
}

function defineCmsGuard(
  label: string,
  check: (appIdentity: CmsAppIdentity) => boolean,
  permission?: CmsPermissionKey,
): CmsGuard {
  return {
    label,
    ...(permission ? { permission } : {}),
    check,
    or: (other) =>
      defineCmsGuard(
        `${label} or ${other.label}`,
        (appIdentity) => check(appIdentity) || other.check(appIdentity),
      ),
  }
}

export function can(appIdentity: CmsAppIdentity, guard: CmsGuard): boolean {
  if (!guard.check(appIdentity)) return false
  if (appIdentity?.kind !== 'member' || appIdentity.audit.origin !== 'mcp') {
    return true
  }
  if (!guard.permission) return false
  if (!mcpDelegatedScopeKeys.includes(guard.permission as (typeof mcpDelegatedScopeKeys)[number])) {
    return false
  }
  return appIdentity.mcpEffectivePermissions?.[guard.permission] === true
}

export function requireRecord<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${label} not found.`)
  }
}

export const isAuthenticated = defineCmsGuard(
  'Authenticated',
  (appIdentity) => appIdentity !== null,
)

export const allowPublic = defineCmsGuard('Public', () => true)

export const isBootstrapUser = defineCmsGuard(
  'Bootstrap CMS',
  (appIdentity) => appIdentity?.canBootstrap === true,
)

export const hasRole = (...roles: CmsRole[]) =>
  defineCmsGuard(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && appIdentity.role !== null && roles.includes(appIdentity.role),
  )

export const canRead = defineCmsGuard(
  'Read CMS',
  hasRole('owner', 'publisher', 'editor', 'viewer').or(isBootstrapUser).check,
  cmsPermissionKeys.read,
)

export const canCreateEntries = defineCmsGuard(
  'Create entries',
  hasRole('owner', 'publisher', 'editor').check,
  cmsPermissionKeys.createEntries,
)

export const canEditEntries = defineCmsGuard(
  'Edit entries',
  hasRole('owner', 'publisher', 'editor').check,
  cmsPermissionKeys.editEntries,
)

export const canPublishEntries = defineCmsGuard(
  'Publish entries',
  (appIdentity) =>
    appIdentity?.audit.origin !== 'mcp' && hasRole('owner', 'publisher').check(appIdentity),
  cmsPermissionKeys.publishEntries,
)

export const canArchiveEntries = defineCmsGuard(
  'Archive entries',
  (appIdentity) =>
    appIdentity?.audit.origin !== 'mcp' && hasRole('owner', 'publisher').check(appIdentity),
  cmsPermissionKeys.archiveEntries,
)

export const canDeleteEntries = defineCmsGuard(
  'Delete entries',
  (appIdentity) => appIdentity?.audit.origin === 'user' && hasRole('owner').check(appIdentity),
  cmsPermissionKeys.deleteEntries,
)

export const canManageCollections = defineCmsGuard(
  'Manage collections',
  hasRole('owner').check,
  cmsPermissionKeys.manageCollections,
)

export const canManageSettings = defineCmsGuard(
  'Manage settings',
  hasRole('owner').check,
  cmsPermissionKeys.manageSettings,
)

export const canManageMembers = defineCmsGuard(
  'Manage members',
  hasRole('owner').check,
  cmsPermissionKeys.manageMembers,
)

export const canManageAssets = defineCmsGuard(
  'Manage assets',
  hasRole('owner', 'publisher', 'editor').check,
  cmsPermissionKeys.manageAssets,
)

export const canManageAssetRecovery = defineCmsGuard(
  'Manage asset recovery',
  (appIdentity) => hasRole('owner').check(appIdentity) && appIdentity?.audit.origin === 'user',
  cmsPermissionKeys.manageAssetRecovery,
)

export const canManagePortability = defineCmsGuard(
  'Manage portability',
  (appIdentity) => hasRole('owner').check(appIdentity) && appIdentity?.audit.origin === 'user',
  cmsPermissionKeys.managePortability,
)

export const cmsPermissionGuards = [
  { key: cmsPermissionKeys.read, guard: canRead },
  { key: cmsPermissionKeys.createEntries, guard: canCreateEntries },
  { key: cmsPermissionKeys.editEntries, guard: canEditEntries },
  { key: cmsPermissionKeys.publishEntries, guard: canPublishEntries },
  { key: cmsPermissionKeys.archiveEntries, guard: canArchiveEntries },
  { key: cmsPermissionKeys.deleteEntries, guard: canDeleteEntries },
  { key: cmsPermissionKeys.manageCollections, guard: canManageCollections },
  { key: cmsPermissionKeys.manageSettings, guard: canManageSettings },
  { key: cmsPermissionKeys.manageMembers, guard: canManageMembers },
  { key: cmsPermissionKeys.manageAssets, guard: canManageAssets },
  { key: cmsPermissionKeys.manageAssetRecovery, guard: canManageAssetRecovery },
  { key: cmsPermissionKeys.managePortability, guard: canManagePortability },
] satisfies Array<{ key: CmsPermissionKey; guard: CmsGuard }>
