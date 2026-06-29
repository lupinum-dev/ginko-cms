import type {
  CmsOperationDescriptor,
  CmsOperationId,
  CmsOperationPreview,
} from './types'

export function cmsOperation<Args, Preview, Result>(
  descriptor: CmsOperationDescriptor<Args, Preview, Result>,
) {
  return descriptor
}

export function cmsOperationPreview<Details>(
  operationId: CmsOperationId,
  preview: Omit<CmsOperationPreview<Details>, 'operationId'>,
): CmsOperationPreview<Details> {
  return {
    operationId,
    ...preview,
  }
}

export function cmsOperationPreviewValidator() {
  return undefined
}

export function blockedOperationPreview<Details>(
  operationId: CmsOperationId,
  details?: Details,
): CmsOperationPreview<Details> {
  return cmsOperationPreview(operationId, {
    destructive: true,
    details,
    blockers: ['TODO(trellis-cutover): restore operation preview logic'],
  })
}

export function operationEffect<T>(effect: T): T {
  return effect
}

export function operationIssue<T>(issue: T): T {
  return issue
}

export function previewOf<T>(preview: T): T {
  return preview
}
