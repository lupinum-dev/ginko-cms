import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import {
  activityOutcomeValidator,
  entryStatusValidator,
  jsonObjectValidator,
  nodeKindValidator,
} from '../validators.js'

export const listEntriesForStudio = defineArgs({
  description: 'List studio entries for a collection with filters and pagination.',
  args: {
    collection: v.string(),
    locale: v.string(),
    parentEntryId: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
    status: v.optional(entryStatusValidator),
    query: v.optional(v.string()),
  },
})

export const resolveRelationEntries = defineArgs({
  description: 'Resolve selected relation values to their editor-facing labels.',
  args: {
    collection: v.string(),
    locale: v.string(),
    stableIds: v.array(v.string()),
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
    paginationOpts: paginationOptsValidator,
  },
})

export const listStudioWorkQueue = defineArgs({
  description: 'Page through actionable Studio work without storing composite readiness state.',
  args: {
    locale: v.string(),
    paginationOpts: paginationOptsValidator,
  },
})

export const getStudioOverview = defineArgs({
  description: 'Load bounded recent publication and operational status for Studio.',
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

export const activityFilterValidator = v.union(
  v.object({
    kind: v.literal('content'),
    entryId: v.string(),
  }),
  v.object({
    kind: v.literal('collection'),
    collection: v.string(),
  }),
  v.object({
    kind: v.literal('actor'),
    appIdentityId: v.string(),
  }),
  v.object({
    kind: v.literal('operation'),
    operationKind: v.string(),
  }),
  v.object({
    kind: v.literal('result'),
    outcome: activityOutcomeValidator,
  }),
  v.object({
    kind: v.literal('time'),
    from: v.number(),
    to: v.number(),
  }),
)

export const listActivity = defineArgs({
  description: 'List recent CMS activity rows within one indexed filter scope.',
  args: {
    filter: v.optional(activityFilterValidator),
    paginationOpts: paginationOptsValidator,
  },
  meta: {
    filter: {
      label: 'Activity filter',
      description:
        'An optional exact content, collection, actor, operation, result, or inclusive time-range filter.',
    },
  },
})

export const listVersions = defineArgs({
  description: 'List saved versions for an entry.',
  args: {
    entryId: v.string(),
    paginationOpts: paginationOptsValidator,
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
    paginationOpts: paginationOptsValidator,
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
    bodyMdc: v.optional(v.string()),
    parentEntryId: v.optional(v.string()),
    orderRank: v.optional(v.string()),
    nodeKind: v.optional(nodeKindValidator),
    stagedAssetIds: v.optional(v.array(v.string())),
  },
  meta: {
    collection: {
      label: 'Collection slug',
      description: 'The collection that should own the new entry.',
      examples: ['docs', 'blog'],
    },
    bodyMdc: {
      label: 'Body (MDC)',
      description: 'Rich-text body for the created locale. Stored on the draft body column.',
    },
    slug: {
      label: 'Slug',
      description: 'Draft slug for the new entry.',
      examples: ['getting-started', 'release-notes'],
    },
  },
})

export const duplicateEntry = defineArgs({
  description:
    'Create a new draft from selected locale drafts of an existing entry with a fresh identity.',
  args: {
    sourceEntryId: v.string(),
    expectedSourceDraftVersion: v.number(),
    variants: v.array(
      v.object({
        locale: v.string(),
        title: v.string(),
        slug: v.string(),
      }),
    ),
  },
  meta: {
    sourceEntryId: {
      label: 'Source entry ID',
      description: 'The entry whose canonical draft content should be copied.',
    },
    expectedSourceDraftVersion: {
      label: 'Expected source draft version',
      description: 'Optimistic concurrency version of the source draft reviewed by the editor.',
    },
    variants: {
      label: 'Locale drafts',
      description: 'Explicitly selected source locale drafts with their new title and slug.',
    },
  },
})

export const createLocaleVariant = defineArgs({
  description:
    'Create a localized variant for an existing entry, either blank or copied from one selected existing locale.',
  args: {
    entryId: v.string(),
    locale: v.string(),
    source: v.union(
      v.object({ kind: v.literal('blank') }),
      v.object({ kind: v.literal('locale'), locale: v.string() }),
    ),
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
    source: {
      label: 'Starting content',
      description:
        'Explicitly start with empty localized content or copy localized values, body, and slug from one existing locale.',
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

export const listPublishRouteImpactPage = defineArgs({
  description: 'Page through the descendant URL changes frozen by a publish preview.',
  args: {
    entryId: v.string(),
    locale: v.string(),
    expectedVersion: v.number(),
    expectedRouteGeneration: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
})

export const unpublishEntry = defineArgs({
  description: 'Remove selected locale publications while retaining their drafts and history.',
  args: {
    entryId: v.string(),
    locales: v.array(v.string()),
  },
})

export const archiveEntry = defineArgs({
  description: 'Archive an entry.',
  args: {
    entryId: v.string(),
  },
})

export const permanentlyDeleteEntry = defineArgs({
  description: 'Permanently delete an archived, dependency-safe entry.',
  args: {
    entryId: v.string(),
    confirmationPhrase: v.string(),
  },
  meta: {
    entryId: {
      label: 'Entry ID',
      description: 'The archived entry to permanently delete.',
    },
    confirmationPhrase: {
      label: 'Confirmation phrase',
      description: 'Enter the exact DELETE <stable-id> phrase shown by the deletion preview.',
    },
  },
})

export const restoreEntry = defineArgs({
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
  description: 'Save a named version of the current draft.',
  args: {
    entryId: v.string(),
    message: v.string(),
  },
  meta: {
    message: {
      label: 'Version note',
      description: 'Short note explaining what this saved version should remember.',
      examples: ['Before IA rewrite', 'Pre-launch version'],
    },
  },
})

export const reorderEntry = defineArgs({
  description: 'Reorder an entry within its tree siblings.',
  args: {
    entryId: v.string(),
    expectedDraftVersion: v.number(),
    beforeEntryId: v.optional(v.string()),
    afterEntryId: v.optional(v.string()),
    parentEntryId: v.optional(v.string()),
  },
})

export const reparentEntry = defineArgs({
  description: 'Move an entry under a different parent in the tree.',
  args: {
    entryId: v.string(),
    expectedDraftVersion: v.number(),
    parentEntryId: v.optional(v.string()),
    beforeEntryId: v.optional(v.string()),
    afterEntryId: v.optional(v.string()),
  },
})
