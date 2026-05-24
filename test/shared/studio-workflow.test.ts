import { describe, expect, it } from 'vitest'

import {
  deriveDestructiveConfirmation,
  formatDestructiveConfirmationPrompt,
} from '../../packages/cms/studio-app/src/lib/destructiveWorkflow'
import {
  deriveImportRunResult,
  deriveImportRunsOverview,
  deriveImportRunSummary,
  formatImportIssue,
} from '../../packages/cms/studio-app/src/lib/importRuns'
import {
  deriveDashboardCollectionSummary,
  deriveEntryNextAction,
  deriveCapabilityWarnings,
  derivePublishConfirmationState,
  deriveStudioWorkQueueSummary,
  deriveTranslationSuggestedAction,
  mapPreviewPanelState,
  publishReadinessFromImpact,
  publicStateLabel,
  publicStateTone,
  type PreviewResultStatus,
} from '../../packages/cms/studio-app/src/lib/publicWorkflow'

describe('Studio public workflow helpers', () => {
  it('summarizes dashboard collection capabilities without treating data-only as routed', () => {
    expect(
      deriveDashboardCollectionSummary([
        { mode: 'route', entryCount: 4, locales: ['en', 'de'] },
        { mode: 'none', entryCount: 2, locales: ['en'] },
        { entryCount: null, locales: [] },
      ]),
    ).toEqual({
      totalCollections: 3,
      routeBackedCollections: 2,
      dataOnlyCollections: 1,
      localizedCollections: 2,
      totalEntries: 6,
    })
  })

  it('derives actionable collection capability warnings', () => {
    expect(deriveCapabilityWarnings({ mode: 'route', pathPrefix: '', locales: [] })).toEqual([
      'Route-backed collections should define a path prefix before publishing pages.',
      'Route-backed collections need at least one locale for public route checks.',
    ])
    expect(
      deriveCapabilityWarnings({ mode: 'none', pathPrefix: '/docs', locales: ['en'] }),
    ).toEqual(['Data-only collections ignore route diagnostics; clear the route-looking prefix.'])
    expect(deriveCapabilityWarnings({ mode: 'none', pathPrefix: '', locales: [] })).toEqual([])
  })

  it('summarizes the editor-first Studio work queue', () => {
    expect(
      deriveStudioWorkQueueSummary({
        changedDrafts: 5,
        missingTranslations: 2,
        failedRevalidation: 1,
        importBlockers: 1,
        pendingRevalidation: 3,
      }),
    ).toEqual({
      needsAttention: 4,
      changedDrafts: 5,
      missingTranslations: 2,
      failedRevalidation: 1,
      importBlockers: 1,
      pendingRevalidation: 3,
      healthy: false,
    })

    expect(deriveStudioWorkQueueSummary({}).healthy).toBe(true)
  })

  it('labels public output state without exposing projection/cache language', () => {
    expect(publicStateLabel('public')).toBe('Public')
    expect(publicStateLabel('draft_only')).toBe('Draft only')
    expect(publicStateLabel('needs_attention')).toBe('Needs attention')
    expect(publicStateLabel('data_only')).toBe('Data-only')
    expect(publicStateTone('needs_attention')).toBe('danger')
  })

  it('derives editor-facing next actions for entry rows', () => {
    expect(
      deriveEntryNextAction({
        publicState: 'needs_attention',
        draftChangedSincePublish: true,
        blockingIssueCount: 2,
        missingTranslationLocales: [],
      }),
    ).toBe('Resolve readiness issues')
    expect(
      deriveEntryNextAction({
        publicState: 'public',
        draftChangedSincePublish: false,
        blockingIssueCount: 0,
        missingTranslationLocales: ['de'],
      }),
    ).toBe('Complete translations')
    expect(
      deriveEntryNextAction({
        publicState: 'public',
        draftChangedSincePublish: true,
        blockingIssueCount: 0,
        missingTranslationLocales: [],
      }),
    ).toBe('Preview website changes')
  })

  it('does not block data-only publishing for route-impact not_publishable previews', () => {
    expect(publishReadinessFromImpact({ status: 'not_publishable', mode: 'none' })).toEqual({
      state: 'ready',
      message: 'Ready to publish data. No route-backed output will be created.',
      confirmable: true,
    })
    expect(publishReadinessFromImpact({ status: 'not_publishable', mode: 'route' }).state).toBe(
      'blocked',
    )
  })

  it('requires a valid publish-impact confirmation before publish execution', () => {
    expect(derivePublishConfirmationState({ readinessState: 'not_previewed' })).toMatchObject({
      canConfirm: false,
      disabledReason: 'Preview publish impact before publishing.',
    })
    expect(derivePublishConfirmationState({ readinessState: 'ready' })).toMatchObject({
      canConfirm: false,
      disabledReason: 'Publish confirmation token is missing. Preview again.',
    })
    expect(
      derivePublishConfirmationState({
        readinessState: 'ready',
        confirmationToken: 'token',
      }),
    ).toMatchObject({
      canConfirm: true,
      disabledReason: null,
    })
    expect(
      derivePublishConfirmationState({
        readinessState: 'expired',
        confirmationToken: 'token',
        confirmationExpiresAt: Date.now() - 1,
      }),
    ).toMatchObject({
      canConfirm: false,
      disabledReason: 'Publish confirmation expired. Preview again before publishing.',
    })
    expect(derivePublishConfirmationState({ readinessState: 'stale' })).toMatchObject({
      canConfirm: false,
      disabledReason: 'Publish impact preview is stale. Preview again before publishing.',
    })
  })

  it('maps public preview result statuses without collapsing not_publishable to ready/info', () => {
    expect(mapPreviewPanelState('ready')).toBe('ready')
    expect(mapPreviewPanelState('blocked')).toBe('blocked')
    expect(mapPreviewPanelState('no_changes')).toBe('no_changes')
    expect(mapPreviewPanelState('not_publishable')).toBe('not_publishable')
  })

  it.each([
    {
      name: 'unknown visibility',
      input: { visibilityKnown: false, variantExists: true },
      expected: 'Visibility unknown - refresh diagnostics before translating.',
    },
    {
      name: 'missing variant',
      input: { visibilityKnown: true, variantExists: false },
      expected: 'Create this locale variant before translating.',
    },
    {
      name: 'parent blocked',
      input: { visibilityKnown: true, variantExists: true, parentBlocked: true },
      expected: 'Fix or publish the parent route in this locale first.',
    },
    {
      name: 'missing route',
      input: { visibilityKnown: true, variantExists: true, missingRoute: true },
      expected: 'Set a localized slug/path, then review public visibility again.',
    },
    {
      name: 'missing fields',
      input: { visibilityKnown: true, variantExists: true, missingFields: ['title'] },
      expected: 'Fill required localized fields: title.',
    },
    {
      name: 'blocked impact',
      input: { visibilityKnown: true, variantExists: true, impactStatus: 'blocked' },
      expected: 'Resolve publish blockers before publishing this translation.',
    },
    {
      name: 'ready website changes',
      input: { visibilityKnown: true, variantExists: true, impactStatus: 'ready' },
      expected: 'Read-only preview is ready; review the website changes before publishing.',
    },
    {
      name: 'published',
      input: { visibilityKnown: true, variantExists: true, published: true },
      expected: 'Published. Preview website changes before publishing further draft changes.',
    },
    {
      name: 'draft exists',
      input: { visibilityKnown: true, variantExists: true },
      expected: 'Draft exists. Review the translation and preview website changes.',
    },
  ])('derives translation suggested action precedence: $name', ({ input, expected }) => {
    expect(
      deriveTranslationSuggestedAction({
        visibilityKnown: input.visibilityKnown,
        variantExists: input.variantExists,
        parentBlocked: input.parentBlocked ?? false,
        missingRoute: input.missingRoute ?? false,
        missingFields: input.missingFields ?? [],
        impactStatus: input.impactStatus as PreviewResultStatus | undefined,
        published: input.published ?? false,
      }),
    ).toBe(expected)
  })

  it('blocks destructive execution when required preview data is stale or malformed', () => {
    expect(
      deriveDestructiveConfirmation({
        kind: 'publish',
        targetLabel: 'hello-world',
        previewRequirement: 'public-impact',
        previewState: 'stale',
      }),
    ).toMatchObject({
      canExecute: false,
      disabledReason: 'Required preview is stale. Refresh it before continuing.',
    })

    expect(
      deriveDestructiveConfirmation({
        kind: 'rollback',
        targetLabel: 'hello-world',
        previewRequirement: 'draft-diff',
        previewState: 'malformed',
      }),
    ).toMatchObject({
      canExecute: false,
      disabledReason: 'Required preview returned an invalid response.',
    })
  })

  it('summarizes delete and state-replacement confirmations with exact targets', () => {
    expect(
      formatDestructiveConfirmationPrompt({
        kind: 'delete',
        targetLabel: 'hello-world',
        targetId: 'entry-1',
        previewRequirement: 'target-summary',
        previewState: 'valid',
      }),
    ).toContain('Delete "hello-world". Target id: entry-1.')

    const rollback = deriveDestructiveConfirmation({
      kind: 'rollback',
      targetLabel: 'hello-world',
      targetId: 'version-2',
      previewRequirement: 'draft-diff',
      previewState: 'valid',
    })
    expect(rollback).toMatchObject({
      canExecute: true,
      targetId: 'version-2',
      summary: 'Roll back "hello-world". Target id: version-2. Preview: draft diff.',
      warning: 'Current draft and published state will be replaced.',
    })
  })
})

describe('Studio import run helpers', () => {
  it('summarizes import workflow runs for the Studio overview', () => {
    const overview = deriveImportRunsOverview([
      {
        _id: 'run-1',
        importRunId: 'import-1',
        kind: 'preview',
        status: 'blocked',
        summary: { blockerCount: 2, warningCount: 1, publishedCount: 0 },
        createdAt: 100,
      },
      {
        _id: 'run-2',
        importRunId: 'import-2',
        kind: 'apply',
        status: 'published',
        summary: { blockerCount: 0, warningCount: 3, publishedCount: 5 },
        createdAt: 200,
      },
    ])

    expect(overview).toMatchObject({
      totalRuns: 2,
      previewRuns: 1,
      applyRuns: 1,
      publishedRuns: 1,
      blockedRuns: 1,
      failedRuns: 0,
      totalBlockers: 2,
      totalWarnings: 4,
      totalPublished: 5,
    })
    expect(overview.latestRun?.importRunId).toBe('import-2')
  })

  it('surfaces malformed apply results instead of treating them as safe', () => {
    const result = deriveImportRunResult({
      _id: 'run-1',
      importRunId: 'import-1',
      kind: 'apply',
      status: 'applied',
      summary: { blockerCount: 2, warningCount: 1, publishedCount: 0 },
    })

    expect(result).toMatchObject({
      malformed: 'Stored apply result is missing or malformed.',
      blockerCount: 2,
      warningCount: 1,
      publishedCount: 0,
    })
  })

  it('derives blockers and entry changes from stored import results', () => {
    const run = {
      _id: 'run-2',
      importRunId: 'import-2',
      kind: 'apply' as const,
      status: 'published',
      result: {
        blockedChanges: [
          { code: 'relation_missing', entryKey: 'docs:child:de', message: 'Missing target' },
        ],
        warnings: [{ kind: 'asset_rewritten', message: 'Image moved' }],
        noops: ['docs:intro:en'],
        entries: {
          created: ['docs:intro:de'],
          updated: ['docs:intro:en'],
          published: ['docs:intro:en', 'docs:intro:de'],
          skipped: ['docs:missing:de'],
        },
        entryChanges: [
          {
            key: 'docs:intro:en',
            status: 'update',
            changes: [{ kind: 'route_update', current: '/docs/old', next: '/docs/intro' }],
          },
        ],
      },
    }

    const result = deriveImportRunResult(run)

    expect(result.blockerCount).toBe(1)
    expect(result.warningCount).toBe(1)
    expect(result.publishedCount).toBe(2)
    expect(result.entryChanges).toEqual([
      {
        key: 'docs:intro:en',
        status: 'update',
        changes: ['route_update: /docs/old -> /docs/intro'],
      },
    ])
    expect(deriveImportRunSummary(run)).toEqual({ blockers: 1, warnings: 1, published: 2 })
    expect(formatImportIssue(result.blockers[0])).toBe(
      'relation_missing · docs:child:de · Missing target',
    )
  })
})
