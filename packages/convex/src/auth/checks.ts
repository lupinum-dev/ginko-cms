import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { CmsAppIdentity } from './appIdentity.js'

export type CmsGuard = {
  label: string
  check: (appIdentity: CmsAppIdentity) => boolean
  or: (other: CmsGuard) => CmsGuard
}

function defineCmsGuard(label: string, check: (appIdentity: CmsAppIdentity) => boolean): CmsGuard {
  return {
    label,
    check,
    or: (other) =>
      defineCmsGuard(
        `${label} or ${other.label}`,
        (appIdentity) => check(appIdentity) || other.check(appIdentity),
      ),
  }
}

export function can(appIdentity: CmsAppIdentity, guard: CmsGuard): boolean {
  return guard.check(appIdentity)
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
)

export const canCreateEntries = defineCmsGuard(
  'Create entries',
  hasRole('owner', 'publisher', 'editor').check,
)

export const canEditEntries = defineCmsGuard(
  'Edit entries',
  hasRole('owner', 'publisher', 'editor').check,
)

export const canPublishEntries = defineCmsGuard(
  'Publish entries',
  hasRole('owner', 'publisher').check,
)

export const canArchiveEntries = defineCmsGuard('Archive entries', hasRole('owner').check)

export const canDeleteEntries = defineCmsGuard('Delete entries', hasRole('owner').check)

export const canManageCollections = defineCmsGuard('Manage collections', hasRole('owner').check)

export const canManageSettings = defineCmsGuard('Manage settings', hasRole('owner').check)

export const canManageMembers = defineCmsGuard('Manage members', hasRole('owner').check)

export const canManageAssets = defineCmsGuard(
  'Manage assets',
  hasRole('owner', 'publisher', 'editor').check,
)
