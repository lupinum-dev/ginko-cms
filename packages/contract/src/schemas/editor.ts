import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import {
  assetDeleteModeValidator,
  entryStatusValidator,
  jsonObjectValidator,
  nodeKindValidator,
} from '../validators.js'

export const listEntries = defineArgs({
  description: 'List CMS entries for a collection and locale.',
  args: {
    collection: v.string(),
    locale: v.string(),
  },
})

export const listEntriesForStudio = defineArgs({
  description: 'List studio entries for a collection with filters and pagination.',
  args: {
    collection: v.string(),
    locale: v.string(),
    paginationOpts: paginationOptsValidator,
    status: v.optional(entryStatusValidator),
    query: v.optional(v.string()),
  },
})

export const listEntrySummaries = defineArgs({
  description: 'List editor-facing entry summaries for a collection work queue.',
  args: {
    collection: v.string(),
    locale: v.string(),
    status: v.optional(entryStatusValidator),
    workState: v.optional(
      v.union(
        v.literal('all'),
        v.literal('changed'),
        v.literal('needs_attention'),
        v.literal('missing_translation'),
      ),
    ),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
})

export const getStudioOverview = defineArgs({
  description: 'Load editor-facing Studio overview and work queue summaries.',
  args: {
    locale: v.string(),
  },
})

export const getEntry = defineArgs({
  description: 'Load one CMS entry for the studio.',
  args: {
    id: v.string(),
    locale: v.optional(v.string()),
  },
})

export const listActivity = defineArgs({
  description: 'List recent CMS activity rows.',
  args: {
    paginationOpts: paginationOptsValidator,
  },
})

export const listVersions = defineArgs({
  description: 'List saved versions for an entry.',
  args: {
    entryId: v.string(),
  },
})

export const getVersionDiff = defineArgs({
  description: 'Load a diff between two saved versions.',
  args: {
    leftVersionId: v.string(),
    rightVersionId: v.string(),
  },
})

export const getEntryActivity = defineArgs({
  description: 'List activity rows for one entry.',
  args: {
    entryId: v.string(),
  },
})

export const getVersionSnapshot = defineArgs({
  description: 'Load the full snapshot of a saved version, optionally filtered to a single locale.',
  args: {
    versionId: v.string(),
    locale: v.optional(v.string()),
  },
})

export const getDraftVsPublishedDiff = defineArgs({
  description: 'Diff the current draft state against the published state for an entry.',
  args: {
    entryId: v.string(),
  },
})

export const createEntry = defineArgs({
  description: 'Create a new CMS entry in a collection.',
  args: {
    collection: v.string(),
    locale: v.optional(v.string()),
    slug: v.string(),
    shared: v.optional(jsonObjectValidator),
    localized: v.optional(jsonObjectValidator),
    parentEntryId: v.optional(v.string()),
    orderRank: v.optional(v.string()),
    nodeKind: v.optional(nodeKindValidator),
  },
  meta: {
    collection: {
      label: 'Collection slug',
      description: 'The collection that should own the new entry.',
      examples: ['docs', 'blog'],
    },
    slug: {
      label: 'Slug',
      description: 'Draft slug for the new entry.',
      examples: ['getting-started', 'release-notes'],
    },
  },
})

export const createLocaleVariant = defineArgs({
  description: 'Create a localized variant for an existing entry.',
  args: {
    entryId: v.string(),
    locale: v.string(),
  },
  meta: {
    entryId: {
      label: 'Entry ID',
      description: 'The entry that should receive a new locale variant.',
    },
    locale: {
      label: 'Locale code',
      description: 'Locale to add for the entry.',
      examples: ['en', 'de'],
    },
  },
})

export const saveEntryDraft = defineArgs({
  description: 'Save shared, placement, slug, and localized draft fields for an entry.',
  args: {
    entryId: v.string(),
    expectedDraftVersion: v.number(),
    patch: v.object({
      shared: v.optional(
        v.object({
          parentEntryId: v.optional(v.union(v.string(), v.null())),
          orderRank: v.optional(v.union(v.string(), v.null())),
          slug: v.optional(v.union(v.string(), v.null())),
          shared: v.optional(jsonObjectValidator),
          nodeKind: v.optional(nodeKindValidator),
        }),
      ),
      locales: v.optional(
        v.record(
          v.string(),
          v.object({
            slug: v.optional(v.union(v.string(), v.null())),
            values: v.optional(jsonObjectValidator),
            bodyMdc: v.optional(v.union(v.string(), v.null())),
          }),
        ),
      ),
    }),
  },
  meta: {
    entryId: {
      label: 'Entry ID',
      description: 'The entry to update.',
    },
    expectedDraftVersion: {
      label: 'Expected draft version',
      description: 'Optimistic concurrency version of the current draft.',
    },
  },
})

export const publishEntry = defineArgs({
  description: 'Publish one or more locales for an entry.',
  args: {
    entryId: v.string(),
    locales: v.array(v.string()),
    message: v.optional(v.string()),
    expectedVersion: v.number(),
  },
  meta: {
    entryId: {
      label: 'Entry ID',
      description: 'The entry to publish.',
    },
    expectedVersion: {
      label: 'Expected version',
      description: 'Current draft version observed before publishing.',
    },
    locales: {
      label: 'Locales',
      description: 'Locales that should be published.',
      examples: [['en']],
    },
  },
})

export const unpublishEntry = defineArgs({
  description: 'Remove the published state from an entry.',
  args: {
    entryId: v.string(),
  },
})

export const archiveEntry = defineArgs({
  description: 'Archive an entry.',
  args: {
    entryId: v.string(),
  },
})

export const unarchiveEntry = defineArgs({
  description: 'Restore an archived entry to draft state.',
  args: {
    entryId: v.string(),
  },
})

export const revertDraftToPublished = defineArgs({
  description: 'Reset the draft state back to the published snapshot.',
  args: {
    entryId: v.string(),
  },
})

export const rollbackVersion = defineArgs({
  description: 'Roll back an entry to a saved version.',
  args: {
    entryId: v.string(),
    versionId: v.string(),
    publish: v.optional(v.boolean()),
  },
})

export const createCheckpoint = defineArgs({
  description: 'Create a named checkpoint for the current draft.',
  args: {
    entryId: v.string(),
    message: v.string(),
  },
  meta: {
    message: {
      label: 'Checkpoint message',
      description: 'Short note explaining why this checkpoint exists.',
      examples: ['Before IA rewrite', 'Pre-launch snapshot'],
    },
  },
})

export const reorderEntry = defineArgs({
  description: 'Reorder an entry within its tree siblings.',
  args: {
    entryId: v.string(),
    beforeEntryId: v.optional(v.string()),
    afterEntryId: v.optional(v.string()),
    parentEntryId: v.optional(v.string()),
  },
})

export const reparentEntry = defineArgs({
  description: 'Move an entry under a different parent in the tree.',
  args: {
    entryId: v.string(),
    parentEntryId: v.optional(v.string()),
    beforeEntryId: v.optional(v.string()),
    afterEntryId: v.optional(v.string()),
  },
})

export const deleteEntry = defineArgs({
  description: 'Delete an entry permanently.',
  args: {
    entryId: v.string(),
    assetMode: v.optional(assetDeleteModeValidator),
    exportArtifactId: v.optional(v.string()),
  },
  meta: {
    assetMode: {
      label: 'Asset handling',
      description: 'What to do with entry-scoped assets before deleting the entry.',
      enum: ['delete', 'moveToCollection'],
      defaultHint: 'delete',
    },
  },
})
