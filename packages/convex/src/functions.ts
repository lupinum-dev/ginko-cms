import { action, internalMutation, internalQuery, mutation, query } from './_generated/server.js'

export const cmsPublicReadTables = [
  'assets',
  'cmsSettings',
  'collections',
  'contentAssetRefs',
  'entries',
  'publicEntries',
  'publicRoutes',
  'siteData',
] as const

export const unsafeRaw = undefined
export const unsafePermit = undefined

export const callerQuery = query
export const callerMutation = mutation
export const callerAction = action

export { action, internalMutation, internalQuery, mutation, query }

