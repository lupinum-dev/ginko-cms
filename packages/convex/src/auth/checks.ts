import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { cmsGuard, open } from './runtime'

import type { CmsAppIdentity } from './appIdentity.js'

export const isAuthenticated = cmsGuard<CmsAppIdentity>(
  'Authenticated',
  (appIdentity) => appIdentity !== null,
)

export const allowPublic = open

export const isBootstrapUser = cmsGuard<CmsAppIdentity>(
  'Bootstrap CMS',
  (appIdentity) => appIdentity?.canBootstrap === true,
)

export const hasRole = (...roles: CmsRole[]) =>
  cmsGuard<CmsAppIdentity>(
    `role:${roles.join('|')}`,
    (appIdentity) => !!appIdentity && appIdentity.role !== null && roles.includes(appIdentity.role),
  )

export const canRead = cmsGuard<CmsAppIdentity>(
  'Read CMS',
  hasRole('owner', 'publisher', 'editor', 'viewer').or(isBootstrapUser),
)

export const canCreateEntries = cmsGuard<CmsAppIdentity>(
  'Create entries',
  hasRole('owner', 'publisher', 'editor'),
)

export const canEditEntries = cmsGuard<CmsAppIdentity>(
  'Edit entries',
  hasRole('owner', 'publisher', 'editor'),
)

export const canPublishEntries = cmsGuard<CmsAppIdentity>(
  'Publish entries',
  hasRole('owner', 'publisher'),
)

export const canArchiveEntries = cmsGuard<CmsAppIdentity>('Archive entries', hasRole('owner'))

export const canDeleteEntries = cmsGuard<CmsAppIdentity>('Delete entries', hasRole('owner'))

export const canManageCollections = cmsGuard<CmsAppIdentity>(
  'Manage collections',
  hasRole('owner'),
)

export const canManageSettings = cmsGuard<CmsAppIdentity>('Manage settings', hasRole('owner'))

export const canManageMembers = cmsGuard<CmsAppIdentity>('Manage members', hasRole('owner'))

export const canManageAssets = cmsGuard('Manage assets', hasRole('owner', 'publisher', 'editor'))
