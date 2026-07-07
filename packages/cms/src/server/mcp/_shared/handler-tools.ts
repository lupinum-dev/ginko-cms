import { getAsset, moveAsset, resolveAssetUrls } from '../direct/assets'
import { createEntry, listEntries, saveEntryDraft } from '../direct/content'
import { explainPublicVisibility, page, sitemap } from '../direct/public'
import exportBackup from '../tools/backup/export-backup'
import getCollection from '../tools/collections/get-collection'
import listCollections from '../tools/collections/list-collections'
import archiveEntry from '../tools/content/archive-entry'
import getEntry from '../tools/content/get-entry'
import getReadinessDetail from '../tools/content/get-readiness-detail'
import previewPublish from '../tools/content/preview-publish'
import publishEntry from '../tools/content/publish-entry'
import requestPublishReview from '../tools/content/request-publish-review'
import restoreEntry from '../tools/content/restore-entry'
import list from '../tools/public/list'
import nav from '../tools/public/nav'
import search from '../tools/public/search'

export const mcpTools = [
  listCollections,
  getCollection,
  listEntries,
  getEntry,
  getReadinessDetail,
  createEntry,
  saveEntryDraft,
  archiveEntry,
  restoreEntry,
  page,
  list,
  search,
  nav,
  sitemap,
  explainPublicVisibility,
  previewPublish,
  publishEntry,
  requestPublishReview,
  getAsset,
  moveAsset,
  resolveAssetUrls,
  exportBackup,
]
