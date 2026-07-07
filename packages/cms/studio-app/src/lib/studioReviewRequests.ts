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
  versionHash: string | null
  isStale: boolean
  staleReason: string | null
  reviewSummary: ReviewSummary
}
