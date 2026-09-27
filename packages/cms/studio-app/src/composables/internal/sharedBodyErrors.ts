import { normalizeConvexError } from '@lupinum/better-convex-vue/errors'
import { CollaborationError } from '@lupinum/ginko-editor/collaboration'
import { classifyGinkoError } from '@public/error-classification'
import { getCmsErrorData } from '@public/utils/cmsErrors'

/** Preserve provider classification at the boundary; the session does not read Error.cause. */
export function normalizeSharedBodyError(failure: unknown): Error {
  if (failure instanceof CollaborationError) return failure
  // Peer contexts can contain two copies of Editor. Rebuild only its explicit
  // public error shape; an arbitrary provider error code is not this contract.
  if (failure instanceof Error && failure.name === 'CollaborationError' && 'code' in failure) {
    switch (failure.code) {
      case 'invalid':
      case 'limit':
      case 'version':
      case 'epoch':
      case 'schema':
      case 'policy':
      case 'content':
      case 'protocol':
      case 'forbidden':
      case 'unavailable':
        return new CollaborationError(failure.code, failure.message)
    }
  }
  const normalized = normalizeConvexError(failure)
  const cms = getCmsErrorData(normalized)
  const category = classifyGinkoError(cms ?? normalized.data, normalized)
  const message = cms?.message ?? normalized.message
  if (normalized.kind === 'authentication' || category === 'auth')
    return new CollaborationError('forbidden', message)
  if (normalized.kind === 'transport' || category === 'rate_limit')
    return new CollaborationError('unavailable', message)
  if (cms?.code === 'EDITOR_COLLABORATION_REJECTED')
    return new CollaborationError('content', message)
  return new Error(cms?.message ?? 'The shared body request could not complete. Try again.')
}
