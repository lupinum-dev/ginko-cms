import { getAsset, moveAsset, resolveAssetUrls } from '../direct/assets'
import { createEntry, listEntries, saveEntryDraft, unarchiveEntry } from '../direct/content'
import { explainPublicVisibility, page, sitemap } from '../direct/public'
import deleteAsset from '../tools/assets/delete-asset'
import exportBackup from '../tools/backup/export-backup'
import getCollection from '../tools/collections/get-collection'
import listCollections from '../tools/collections/list-collections'
import archiveEntry from '../tools/content/archive-entry'
import deleteEntry from '../tools/content/delete-entry'
import getEntry from '../tools/content/get-entry'
import publishEntry from '../tools/content/publish-entry'
import unpublishEntry from '../tools/content/unpublish-entry'
import list from '../tools/public/list'
import nav from '../tools/public/nav'
import search from '../tools/public/search'

export const mcpTools = [
  listCollections,
  getCollection,
  listEntries,
  getEntry,
  createEntry,
  saveEntryDraft,
  unarchiveEntry,
  page,
  list,
  search,
  nav,
  sitemap,
  explainPublicVisibility,
  publishEntry,
  unpublishEntry,
  archiveEntry,
  deleteEntry,
  deleteAsset,
  getAsset,
  moveAsset,
  resolveAssetUrls,
  exportBackup,
]
