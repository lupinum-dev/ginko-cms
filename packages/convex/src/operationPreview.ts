import { v } from 'convex/values'

export type OperationPreviewIssue = {
  code: string
  message: string
  status?: 'blocked' | 'stale'
  count?: number
  details?: unknown
}

export type OperationPreviewEffect = {
  kind: string
  summary: string
  count?: number | null
  minimumCount?: number
  countLabel?: string
}

export type PreviewInput = {
  allowed?: boolean
  summary?: string
  blockers?: OperationPreviewIssue[]
  warnings?: OperationPreviewIssue[]
  effects?: OperationPreviewEffect[]
  details?: unknown
  confirm?: unknown
  version?: unknown
}

export type PreviewResult = {
  allowed: boolean
  blockers: OperationPreviewIssue[]
  warnings: OperationPreviewIssue[]
  effects: OperationPreviewEffect[]
  summary: string
  details: unknown
  confirm: unknown
  confirmation: { token: string; expiresAt: number } | null
  version: unknown
}

export function operationIssue<TIssue extends OperationPreviewIssue>(issue: TIssue): TIssue {
  return issue
}

export function operationEffect<TEffect extends OperationPreviewEffect>(effect: TEffect): TEffect {
  return effect
}

export function buildPreview<TPreview extends PreviewInput>(preview: TPreview): PreviewResult {
  const blockers = preview.blockers ?? []
  return {
    allowed: preview.allowed ?? blockers.length === 0,
    blockers,
    warnings: preview.warnings ?? [],
    effects: preview.effects ?? [],
    summary: preview.summary ?? '',
    details: preview.details ?? null,
    confirm: preview.confirm ?? null,
    confirmation: null,
    version: preview.version ?? null,
  }
}

export function blockedPreview(input: PreviewInput & { blocker?: OperationPreviewIssue }) {
  return buildPreview({
    ...input,
    allowed: false,
    blockers: input.blockers ?? (input.blocker === undefined ? [] : [input.blocker]),
  })
}

export function previewResultValidator() {
  const issue = v.object({
    code: v.string(),
    message: v.string(),
    status: v.optional(v.union(v.literal('blocked'), v.literal('stale'))),
    count: v.optional(v.number()),
    details: v.optional(v.any()),
  })
  const effect = v.object({
    kind: v.string(),
    summary: v.string(),
    count: v.optional(v.union(v.number(), v.null())),
    minimumCount: v.optional(v.number()),
    countLabel: v.optional(v.string()),
  })
  return v.object({
    allowed: v.boolean(),
    blockers: v.array(issue),
    warnings: v.array(issue),
    effects: v.array(effect),
    summary: v.string(),
    details: v.any(),
    confirm: v.any(),
    confirmation: v.union(
      v.object({
        token: v.string(),
        expiresAt: v.number(),
      }),
      v.null(),
    ),
    version: v.any(),
  })
}
