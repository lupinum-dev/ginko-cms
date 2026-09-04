import type {
  CollectionRouting,
  CmsField as SharedCmsField,
  CompletionState as SharedCompletionState,
  JsonMap,
  JsonValue,
  LocaleText,
  LocaleState as SharedLocaleState,
  SlugMode as SharedSlugMode,
  ValidationError as SharedValidationError,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel.js'
import type { CmsAppIdentity } from '../auth/appIdentity.js'

export type QueryCtx = GenericQueryCtx<DataModel>
export type MutationCtx = GenericMutationCtx<DataModel>
export type QueryOrMutationCtx = QueryCtx | MutationCtx
export type ReadCtx = {
  db: Pick<QueryCtx['db'], 'get' | 'normalizeId' | 'query'>
}
export type CmsField = SharedCmsField
export type SlugMode = SharedSlugMode

/** Handler context enriched with the appIdentity accessor injected by the structured builder. */
export type HandlerQueryCtx = QueryCtx & { appIdentity: () => Promise<CmsAppIdentity> }
export type HandlerMutationCtx = MutationCtx & {
  appIdentity: () => Promise<CmsAppIdentity>
}

export type CmsCollection = {
  /** Stable domain identity. This is the collection slug, not a database ID. */
  _id: string
  slug: string
  label: LocaleText
  icon: string | null
  type: 'flat' | 'tree'
  fields: CmsField[]
  routing: CollectionRouting
  locales: string[]
  settings: JsonValue
  contract: { source: 'code'; version: string }
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export type EntryDoc = Doc<'entries'>

export type LocaleState = SharedLocaleState
export type ValidationError = SharedValidationError
export type CompletionState = SharedCompletionState

export type EntryId = Id<'entries'>

export type ActivityDoc = Doc<'activity'>

export type VersionLocaleSnapshot = {
  slug: string | null
  path: string
  shared?: JsonMap
  values: JsonMap
}

export type VersionSnapshot = {
  baseSlug: string
  stableId: string | null
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  parentEntryId: EntryId | null
  orderRank: string | null
  shared: JsonMap
  locales: Record<string, VersionLocaleSnapshot | null>
}

export type DraftSnapshot = VersionSnapshot
