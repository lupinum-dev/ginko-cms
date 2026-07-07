import type {
  ReadinessAction,
  ReadinessActionKind,
  ReadinessActionTarget,
  ReadinessIssue,
  ReadinessIssueCode,
  ReadinessSeverity,
  ReadinessState,
} from '../src/readiness.js'

const state: ReadinessState = 'draft'
const severity: ReadinessSeverity = 'blocker'
const issueCode: ReadinessIssueCode = 'required_field_missing'
const actionKind: ReadinessActionKind = 'preview_publish'
const actionTarget: ReadinessActionTarget = 'publish'

const issue: ReadinessIssue = {
  code: issueCode,
  severity,
  locale: 'en',
  fieldPath: 'title',
  messageParams: { field: 'title', required: true, count: 1, empty: null },
  diagnosticId: null,
}

const action: ReadinessAction = {
  kind: actionKind,
  locale: 'en',
  target: actionTarget,
  params: { field: 'title', required: true, count: 1, empty: null },
}

void state
void issue
void action

// @ts-expect-error Published is an entry status, not a readiness state.
const invalidState: ReadinessState = 'published'

// @ts-expect-error Issue codes are stable snake_case codes.
const invalidIssueCode: ReadinessIssueCode = 'missingRequiredField'

// @ts-expect-error Action kinds are stable snake_case codes, not UI labels.
const invalidActionKind: ReadinessActionKind = 'Preview website changes'

const invalidIssue: ReadinessIssue = {
  code: 'required_field_missing',
  severity: 'blocker',
  locale: null,
  fieldPath: null,
  // @ts-expect-error Params are intentionally flat JSON-safe scalars.
  messageParams: { nested: { field: 'title' } },
  diagnosticId: null,
}

void invalidState
void invalidIssueCode
void invalidActionKind
void invalidIssue
