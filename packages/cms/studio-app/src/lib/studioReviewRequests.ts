import type {
  PublishReviewPreview,
  ReviewSummary,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'

export type StudioReviewRequest = {
  _id: string
  agentRunId: string | null
  requestSource: 'human' | 'agent'
  operationId: string
  entryId: string
  locales: string[]
  expectedVersion: number
  message: string | null
  title: string
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  preview: PublishReviewPreview
  requestedBy: string
  reviewedBy: string | null
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  reviewFeedback: string | null
  versionHash: string | null
  isStale: boolean
  staleReason: string | null
  reviewSummary: ReviewSummary
}

// Slim serialized shape of a closed review request
// (reviewRequests.listRecentReviewOutcomes / listRecentReviewOutcomesForEntry).
export type StudioReviewOutcome = {
  _id: string
  entryId: string
  status: 'approved' | 'rejected'
  title: string
  locales: string[]
  expectedVersion: number
  createdAt: number
  reviewedBy: string | null
  reviewedByLabel: string | null
  reviewedAt: number | null
  reviewFeedback: string | null
}
