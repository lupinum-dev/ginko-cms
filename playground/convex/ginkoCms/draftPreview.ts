import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

// EDT-10 draft preview: guarded read of the CURRENT draft rows so an
// authenticated, authorized editor can preview a page before publishing.
// The host renders it on a noindex preview route (convention: /preview/
// [collection]/[entryId]?locale=...). No tokens — access is the Studio
// session's canRead guard inside the component.
export const getDraftPreview = query({
  args: {
    entryId: v.string(),
    locale: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.draftPreview.getDraftPreview, args),
})
