import { getAsset, moveAsset, resolveAssetUrls } from '../direct/assets'
import { createEntry, listEntries, saveEntryDraft, unarchiveEntry } from '../direct/content'
import { explainPublicVisibility, page, sitemap } from '../direct/public'
import exportBackup from '../tools/backup/export-backup'
import getCollection from '../tools/collections/get-collection'
import listCollections from '../tools/collections/list-collections'
import getEntry from '../tools/content/get-entry'
import previewPublish from '../tools/content/preview-publish'
import requestPublishReview from '../tools/content/request-publish-review'
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
  previewPublish,
  requestPublishReview,
  getAsset,
  moveAsset,
  resolveAssetUrls,
  exportBackup,
]
