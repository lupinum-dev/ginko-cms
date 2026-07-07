export type DestructiveActionKind =
  | 'publish'
  | 'unpublish'
  | 'archive'
  | 'delete'
  | 'rollback'
  | 'restore-draft'
  | 'revert-draft'

export type DestructiveSeverity = 'medium' | 'high' | 'critical'
export type DestructivePreviewRequirement =
  | 'none'
  | 'target-summary'
  | 'draft-diff'
  | 'public-impact'
export type DestructivePreviewState =
  | 'not_required'
  | 'missing'
  | 'pending'
  | 'valid'
  | 'stale'
  | 'failed'
  | 'malformed'

export interface DestructiveConfirmationInput {
  kind: DestructiveActionKind
  targetLabel: string
  targetId?: string | null
  severity?: DestructiveSeverity
  previewRequirement?: DestructivePreviewRequirement
  previewState?: DestructivePreviewState
  previewLabel?: string
  warning?: string
}

export interface DestructiveConfirmationState {
  kind: DestructiveActionKind
  targetLabel: string
  targetId: string | null
  severity: DestructiveSeverity
  previewRequirement: DestructivePreviewRequirement
  previewState: DestructivePreviewState
  summary: string
  warning: string | null
  canExecute: boolean
  disabledReason: string | null
}

const ACTION_LABELS: Record<DestructiveActionKind, string> = {
  publish: 'Publish',
  unpublish: 'Unpublish',
  archive: 'Archive',
  delete: 'Delete',
  rollback: 'Roll back',
  'restore-draft': 'Restore draft snapshot',
  'revert-draft': 'Revert draft',
}

const STATE_DISABLED_REASONS: Partial<Record<DestructivePreviewState, string>> = {
  missing: 'Required preview is missing.',
  pending: 'Required preview is still loading.',
  stale: 'Required preview is stale. Refresh it before continuing.',
  failed: 'Required preview failed. Fix the error before continuing.',
  malformed: 'Required preview returned an invalid response.',
}

export function deriveDestructiveConfirmation(
  input: DestructiveConfirmationInput,
): DestructiveConfirmationState {
  const previewRequirement = input.previewRequirement ?? 'target-summary'
  const previewState =
    input.previewState ?? (previewRequirement === 'none' ? 'not_required' : 'valid')
  const disabledReason =
    previewRequirement === 'none' || previewState === 'valid' || previewState === 'not_required'
      ? null
      : (STATE_DISABLED_REASONS[previewState] ?? 'Required preview is not usable.')
  const action = ACTION_LABELS[input.kind]
  const previewSuffix =
    previewRequirement === 'none'
      ? ''
      : ` Preview: ${input.previewLabel ?? previewRequirement.replace('-', ' ')}.`
  const targetIdSuffix = input.targetId ? ` Target id: ${input.targetId}.` : ''

  return {
    kind: input.kind,
    targetLabel: input.targetLabel,
    targetId: input.targetId ?? null,
    severity: input.severity ?? 'high',
    previewRequirement,
    previewState,
    summary: `${action} "${input.targetLabel}".${targetIdSuffix}${previewSuffix}`,
    warning: input.warning ?? defaultWarning(input.kind),
    canExecute: disabledReason === null,
    disabledReason,
  }
}

export function formatDestructiveConfirmationPrompt(input: DestructiveConfirmationInput): string {
  const state = deriveDestructiveConfirmation(input)
  const lines = [state.summary]
  if (state.warning) lines.push(state.warning)
  if (state.disabledReason) lines.push(state.disabledReason)
  return lines.join('\n\n')
}

function defaultWarning(kind: DestructiveActionKind): string | null {
  switch (kind) {
    case 'unpublish':
      return 'The entry will no longer be visible on the public site.'
    case 'archive':
      return 'The entry will be removed from public view.'
    case 'delete':
      return 'This cannot be undone.'
    case 'rollback':
      return 'Current draft and published state will be replaced.'
    case 'restore-draft':
      return 'Current draft changes will be replaced by the selected snapshot.'
    case 'revert-draft':
      return 'All unpublished draft changes will be lost.'
    case 'publish':
      return 'Preview website changes before publishing public content.'
    default:
      return null
  }
}
