import { describe, expect, it } from 'vitest'

import en from '../../packages/cms/src/public/locales/en'
import {
  deriveDestructiveConfirmation,
  formatDestructiveConfirmationPrompt,
} from '../../packages/cms/studio-app/src/lib/destructiveWorkflow'
import {
  deriveCapabilityWarnings,
  derivePublishConfirmationState,
  mapPreviewPanelState,
  publicStateLabel,
  publicStateTone,
  readinessActionLabel,
  readinessIssueMessage,
  readinessStateLabel,
  readinessStateTone,
  websiteRefreshStatusLabel,
  websiteRefreshStatusMessage,
} from '../../packages/cms/studio-app/src/lib/publicWorkflow'
import {
  assertReadinessActionKind,
  assertReadinessActionTarget,
  assertReadinessIssueCode,
  assertReadinessSeverity,
  assertReadinessState,
  createReadinessAction,
  createReadinessIssue,
  entryListWorkStates,
  readinessActionKinds,
  readinessActionTargets,
  readinessIssueCodes,
  readinessSeverities,
  readinessStates,
} from '../../packages/contract/src/readiness'
import {
  readinessActionKindValidator,
  readinessActionTargetValidator,
  entryListWorkStateValidator,
  readinessIssueCodeValidator,
  readinessSeverityValidator,
  readinessStateValidator,
} from '../../packages/contract/src/validators'

function testT(key: string, params?: Record<string, unknown>, defaultValue?: string): string {
  let value: unknown = en
  for (const segment of key.split('.')) {
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
  }
  if (typeof value !== 'string') return defaultValue ?? key
  return Object.entries(params ?? {}).reduce(
    (message, [paramKey, paramValue]) => message.replaceAll(`{${paramKey}}`, String(paramValue)),
    value,
  )
}

function validatorLiteralValues(validator: unknown): string[] {
  const record = validator as { kind?: string; value?: unknown; members?: unknown[] }
  if (record.kind === 'literal' && typeof record.value === 'string') return [record.value]
  return (record.members ?? []).flatMap(validatorLiteralValues)
}

describe('canonical readiness vocabulary', () => {
  it('defines the accepted marketer workflow states in contract vocabulary', () => {
    expect(readinessStates).toEqual([
      'draft',
      'needs_work',
      'ready',
      'in_review',
      'live',
      'live_with_changes',
      'missing',
    ])
    expect(validatorLiteralValues(readinessStateValidator)).toEqual(readinessStates)
  })

  it('defines the cheap list-only work states in contract vocabulary', () => {
    expect(entryListWorkStates).toEqual([
      'missing_translation',
      'blocked',
      'public',
      'changed',
      'draft',
    ])
    expect(entryListWorkStates).not.toContain('ready')
    expect(validatorLiteralValues(entryListWorkStateValidator)).toEqual(entryListWorkStates)
  })

  it('defines stable severity, action target, and action kind vocabularies', () => {
    expect(readinessSeverities).toEqual(['blocker', 'warning', 'info'])
    expect(validatorLiteralValues(readinessSeverityValidator)).toEqual(readinessSeverities)
    expect(readinessActionTargets).toEqual([
      'editor',
      'field',
      'locale',
      'asset',
      'route',
      'review',
      'publish',
      'settings',
      'diagnostics',
    ])
    expect(validatorLiteralValues(readinessActionTargetValidator)).toEqual(readinessActionTargets)
    expect(readinessActionKinds).toEqual(
      expect.arrayContaining([
        'continue_editing',
        'fill_required_field',
        'add_locale',
        'ask_ai_to_translate',
        'preview_subtree_rebuild',
        'request_review',
        'confirm_publish',
        'agent_publish',
        'save_version',
      ]),
    )
    expect(validatorLiteralValues(readinessActionKindValidator)).toEqual(readinessActionKinds)
  })

  it('defines stable issue codes without marketer-facing copy', () => {
    expect(readinessIssueCodes).toEqual(
      expect.arrayContaining([
        'required_field_missing',
        'data_only_required_field_missing',
        'locale_missing',
        'route_descendant_collision',
        'review_preview_missing',
        'permission_agent_scope_missing',
        'agent_publish_requires_permission',
        'asset_metadata_stale',
        'relation_target_not_public',
        'projection_route_mismatch',
        'revalidation_failed',
        'draft_version_conflict',
      ]),
    )
    expect(validatorLiteralValues(readinessIssueCodeValidator)).toEqual(readinessIssueCodes)
    expect(readinessIssueCodes.some((code) => /[A-Z\s.]/.test(code))).toBe(false)
  })

  it('rejects unknown readiness state, issue, severity, action kind, and action target values', () => {
    expect(() => assertReadinessState('draft')).not.toThrow()
    expect(() => assertReadinessState('published')).toThrow(/Unknown readiness state/)
    expect(() => assertReadinessSeverity('blocker')).not.toThrow()
    expect(() => assertReadinessSeverity('danger')).toThrow(/Unknown readiness severity/)
    expect(() => assertReadinessIssueCode('required_field_missing')).not.toThrow()
    expect(() => assertReadinessIssueCode('missingRequiredField')).toThrow(
      /Unknown readiness issue code/,
    )
    expect(() => assertReadinessActionKind('preview_publish')).not.toThrow()
    expect(() => assertReadinessActionKind('preview website changes')).toThrow(
      /Unknown readiness action kind/,
    )
    expect(() => assertReadinessActionTarget('publish')).not.toThrow()
    expect(() => assertReadinessActionTarget('button')).toThrow(/Unknown readiness action target/)
  })

  it('creates JSON-safe readiness issues and actions', () => {
    expect(
      createReadinessIssue({
        code: 'required_field_missing',
        severity: 'blocker',
        locale: 'en',
        fieldPath: 'title',
        messageParams: { field: 'title', count: 1, shared: false, empty: null },
        diagnosticId: null,
      }),
    ).toMatchObject({
      code: 'required_field_missing',
      severity: 'blocker',
      locale: 'en',
      fieldPath: 'title',
      messageParams: { field: 'title', count: 1, shared: false, empty: null },
      diagnosticId: null,
    })

    expect(
      createReadinessAction({
        kind: 'fill_required_field',
        locale: 'en',
        target: 'field',
        params: { field: 'title', required: true },
      }),
    ).toMatchObject({
      kind: 'fill_required_field',
      locale: 'en',
      target: 'field',
      params: { field: 'title', required: true },
    })

    expect(() =>
      createReadinessIssue({
        code: 'required_field_missing',
        severity: 'blocker',
        locale: null,
        fieldPath: null,
        messageParams: { bad: { nested: 'value' } },
        diagnosticId: null,
      }),
    ).toThrow(/Readiness params must be a flat JSON-safe record/)

    expect(() =>
      createReadinessAction({
        kind: 'fill_required_field',
        locale: null,
        target: 'field',
        params: { bad: ['title'] },
      }),
    ).toThrow(/Readiness params must be a flat JSON-safe record/)
  })
})

describe('Studio public workflow helpers', () => {
  it('derives actionable collection capability warnings', () => {
    expect(
      deriveCapabilityWarnings({ mode: 'route', pathPrefix: '', locales: [], t: testT }),
    ).toEqual([
      'Website page collections should define a URL prefix before publishing pages.',
      'Website page collections need at least one language for URL checks.',
    ])
    expect(
      deriveCapabilityWarnings({ mode: 'none', pathPrefix: '/docs', locales: ['en'], t: testT }),
    ).toEqual(['Shared data collections ignore URL checks. Clear the page-looking prefix.'])
    expect(
      deriveCapabilityWarnings({ mode: 'none', pathPrefix: '', locales: [], t: testT }),
    ).toEqual([])
  })

  it('labels live website state without exposing projection/cache language', () => {
    expect(publicStateLabel(testT, 'public')).toBe('Live')
    expect(publicStateLabel(testT, 'draft_only')).toBe('Draft only')
    expect(publicStateLabel(testT, 'needs_attention')).toBe('Needs attention')
    expect(publicStateLabel(testT, 'data_only')).toBe('Shared data')
    expect(publicStateTone('needs_attention')).toBe('danger')
  })

  it('maps backend readiness codes to marketer-facing Studio copy', () => {
    expect(readinessStateLabel(testT, 'draft')).toBe('Draft')
    expect(readinessStateLabel(testT, 'needs_work')).toBe('Needs work')
    expect(readinessStateLabel(testT, 'ready')).toBe('Ready to publish')
    expect(readinessStateLabel(testT, 'in_review')).toBe('In review')
    expect(readinessStateLabel(testT, 'live')).toBe('Live')
    expect(readinessStateLabel(testT, 'live_with_changes')).toBe('Live with unpublished changes')
    expect(readinessStateLabel(testT, 'missing')).toBe('Missing language')
    expect(
      readinessIssueMessage(testT, {
        code: 'required_localized_field_missing',
        fieldPath: 'title',
      }),
    ).toBe('Required translation field is missing: title')
    expect(readinessActionLabel(testT, 'publish_locale')).toBe('Publish this language')
  })

  it('derives status pill tones from state codes, never from localized labels', () => {
    expect(readinessStateTone('live')).toBe('success')
    expect(readinessStateTone('live_with_changes')).toBe('success')
    expect(readinessStateTone('ready')).toBe('success')
    expect(readinessStateTone('needs_work')).toBe('warning')
    expect(readinessStateTone('missing')).toBe('warning')
    expect(readinessStateTone('in_review')).toBe('info')
    // Plain drafts are a normal state, not a problem state.
    expect(readinessStateTone('draft')).toBe('neutral')
    expect(readinessStateTone(null)).toBe('neutral')
    expect(readinessStateTone(undefined)).toBe('neutral')
    // Blockers override every state.
    expect(readinessStateTone('live', { blocked: true })).toBe('warning')
    expect(readinessStateTone('draft', { blocked: true })).toBe('warning')
    // Tone is code-driven: a German (or any) label never changes the result,
    // because the label is not an input at all.
    expect(readinessStateTone('live')).toBe(readinessStateTone('live', { blocked: false }))
  })

  it('maps website refresh job states to marketer-facing Studio copy', () => {
    expect(websiteRefreshStatusLabel(testT, 'pending')).toBe('Website refresh pending')
    expect(websiteRefreshStatusLabel(testT, 'delivering')).toBe('Website refresh running')
    expect(websiteRefreshStatusLabel(testT, 'delivered')).toBe('Website refresh complete')
    expect(websiteRefreshStatusLabel(testT, 'failed')).toBe('Website refresh failed')
    expect(
      websiteRefreshStatusMessage(testT, {
        lastError: null,
        paths: ['/docs/root-a/child', '/docs/root-renamed/child'],
        status: 'pending',
      }),
    ).toBe('/docs/root-a/child, /docs/root-renamed/child')
    expect(
      websiteRefreshStatusMessage(testT, {
        lastError: 'Host returned 403',
        paths: [],
        status: 'failed',
      }),
    ).toBe('Host returned 403')
  })

  it('requires a valid publish-impact confirmation before publish execution', () => {
    expect(
      derivePublishConfirmationState({ readinessState: 'not_previewed', t: testT }),
    ).toMatchObject({
      canConfirm: false,
      disabledReason: 'Preview website changes before publishing.',
    })
    expect(derivePublishConfirmationState({ readinessState: 'ready', t: testT })).toMatchObject({
      canConfirm: false,
      disabledReason: 'Preview website changes again before publishing.',
    })
    expect(
      derivePublishConfirmationState({
        readinessState: 'ready',
        t: testT,
        confirmationToken: 'token',
      }),
    ).toMatchObject({
      canConfirm: true,
      disabledReason: null,
    })
    expect(
      derivePublishConfirmationState({
        readinessState: 'expired',
        t: testT,
        confirmationToken: 'token',
        confirmationExpiresAt: Date.now() - 1,
      }),
    ).toMatchObject({
      canConfirm: false,
      disabledReason: 'The preview expired. Preview website changes again before publishing.',
    })
    expect(derivePublishConfirmationState({ readinessState: 'stale', t: testT })).toMatchObject({
      canConfirm: false,
      disabledReason: 'This draft changed since the preview. Preview website changes again.',
    })
  })

  it('maps public preview result statuses without collapsing not_publishable to ready/info', () => {
    expect(mapPreviewPanelState('ready')).toBe('ready')
    expect(mapPreviewPanelState('blocked')).toBe('blocked')
    expect(mapPreviewPanelState('no_changes')).toBe('no_changes')
    expect(mapPreviewPanelState('not_publishable')).toBe('not_publishable')
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
