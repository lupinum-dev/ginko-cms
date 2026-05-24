import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { defineGuard, open } from '@lupinum/trellis/auth'

import type { CmsAppIdentity } from './appIdentity.js'

export const isAuthenticated = defineGuard<CmsAppIdentity>(
  'Authenticated',
  (appIdentity) => appIdentity !== null,
)

export const allowPublic = open

export const isBootstrapUser = defineGuard<CmsAppIdentity>(
  'Bootstrap CMS',
  (appIdentity) => appIdentity?.canBootstrap === true,
)

export const hasRole = (...roles: CmsRole[]) =>
  defineGuard<CmsAppIdentity>(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && appIdentity.role !== null && roles.includes(appIdentity.role),
  )

export const canRead = defineGuard<CmsAppIdentity>(
  'Read CMS',
  hasRole('owner', 'publisher', 'editor', 'viewer').or(isBootstrapUser),
)

export const canCreateEntries = defineGuard<CmsAppIdentity>(
  'Create entries',
  hasRole('owner', 'publisher', 'editor'),
)

export const canEditEntries = defineGuard<CmsAppIdentity>(
  'Edit entries',
  hasRole('owner', 'publisher', 'editor'),
)

export const canPublishEntries = defineGuard<CmsAppIdentity>(
  'Publish entries',
  hasRole('owner', 'publisher'),
)

export const canArchiveEntries = defineGuard<CmsAppIdentity>('Archive entries', hasRole('owner'))

export const canDeleteEntries = defineGuard<CmsAppIdentity>('Delete entries', hasRole('owner'))

export const canManageCollections = defineGuard<CmsAppIdentity>(
  'Manage collections',
  hasRole('owner'),
)

export const canManageSettings = defineGuard<CmsAppIdentity>('Manage settings', hasRole('owner'))

export const canManageMembers = defineGuard<CmsAppIdentity>('Manage members', hasRole('owner'))

export const canManageAssets = defineGuard('Manage assets', hasRole('owner', 'publisher', 'editor'))
