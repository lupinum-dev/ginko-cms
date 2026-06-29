import type { CmsOperationRegistry } from './types'

// TODO(trellis-cutover): restore descriptors in Phase 6 after the hard cutover.
export const cmsOperationRegistry = {} satisfies CmsOperationRegistry

export function getCmsOperation(operationId: string) {
  return cmsOperationRegistry[operationId as keyof typeof cmsOperationRegistry]
}

