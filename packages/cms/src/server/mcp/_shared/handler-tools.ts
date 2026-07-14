import { completeAgentRun, listAgentRuns, startAgentRun } from '../direct/agent-runs'
import { getAsset, resolveAssetUrls } from '../direct/assets'
import { createEntry, listEntries, saveEntryDraft } from '../direct/content'
import { explainPublicVisibility, page, sitemap } from '../direct/public'
import getCollection from '../tools/collections/get-collection'
import listCollections from '../tools/collections/list-collections'
import getEntry from '../tools/content/get-entry'
import getReadinessDetail from '../tools/content/get-readiness-detail'
import getReviewStatus from '../tools/content/get-review-status'
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
  getReadinessDetail,
  startAgentRun,
  listAgentRuns,
  completeAgentRun,
  createEntry,
  saveEntryDraft,
  page,
  list,
  search,
  nav,
  sitemap,
  explainPublicVisibility,
  previewPublish,
  requestPublishReview,
  getReviewStatus,
  getAsset,
  resolveAssetUrls,
]
