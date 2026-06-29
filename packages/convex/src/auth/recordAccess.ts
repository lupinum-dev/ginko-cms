import { can } from './runtime'
import { cmsRecordAccess } from './runtime'

import type { Doc } from '../_generated/dataModel.js'
import type { CmsAppIdentity } from './appIdentity.js'
import { canArchiveEntries, canDeleteEntries, canEditEntries, canPublishEntries } from './checks.js'

export const entryRecordAccess = cmsRecordAccess<Doc<'entries'>>()({
  edit: (appIdentity: CmsAppIdentity) => can(appIdentity, canEditEntries),
  publish: (appIdentity: CmsAppIdentity) => can(appIdentity, canPublishEntries),
  archive: (appIdentity: CmsAppIdentity) => can(appIdentity, canArchiveEntries),
  delete: (appIdentity: CmsAppIdentity) => can(appIdentity, canDeleteEntries),
})

type EntryRecordAccessFlags = {
  edit: boolean
  publish: boolean
  archive: boolean
  delete: boolean
}

export function getEntryRecordAccessFlags(appIdentity: CmsAppIdentity): EntryRecordAccessFlags {
  return {
    edit: can(appIdentity, canEditEntries),
    publish: can(appIdentity, canPublishEntries),
    archive: can(appIdentity, canArchiveEntries),
    delete: can(appIdentity, canDeleteEntries),
  }
}

export function attachEntryRecordAccess<T extends Record<string, unknown>>(
  appIdentity: CmsAppIdentity,
  value: T,
): T & { _can: EntryRecordAccessFlags }
export function attachEntryRecordAccess<T extends Record<string, unknown>>(
  appIdentity: CmsAppIdentity,
  value: T[],
): Array<T & { _can: EntryRecordAccessFlags }>
export function attachEntryRecordAccess<T extends Record<string, unknown>>(
  appIdentity: CmsAppIdentity,
  value: T | T[],
) {
  const flags = getEntryRecordAccessFlags(appIdentity)
  const attach = (item: T) => ({ ...item, _can: flags })
  return Array.isArray(value) ? value.map(attach) : attach(value)
}
