import { ConvexCallError } from '@lupinum/better-convex-vue/errors'
import { CollaborationError } from '@lupinum/ginko-editor/collaboration'
import { describe, expect, it } from 'vitest'

import { normalizeSharedBodyError } from '../../packages/cms/studio-app/src/composables/internal/sharedBodyErrors'

describe('shared body transport failures', () => {
  it('classifies a revoked membership at the top level so it stops retries', () => {
    const error = new ConvexCallError({
      kind: 'server',
      message: 'Revoked',
      data: { code: 'FORBIDDEN', message: 'Membership revoked' },
    })
    expect(normalizeSharedBodyError(error)).toMatchObject({
      code: 'forbidden',
      message: 'Membership revoked',
    })
    expect(
      normalizeSharedBodyError(new ConvexCallError({ kind: 'authentication', message: 'Sign in' })),
    ).toMatchObject({ code: 'forbidden' })
  })
  it('retries a known network failure and preserves a content rejection', () => {
    expect(
      normalizeSharedBodyError(new ConvexCallError({ kind: 'transport', message: 'Disconnected' })),
    ).toMatchObject({ code: 'unavailable' })
    const rejected = new ConvexCallError({
      kind: 'server',
      message: 'Rejected',
      data: { code: 'EDITOR_COLLABORATION_REJECTED', message: 'Invalid operation' },
    })
    expect(normalizeSharedBodyError(rejected)).toMatchObject({ code: 'content' })
    const existing = new CollaborationError('schema', 'Schema changed')
    expect(normalizeSharedBodyError(existing)).toMatchObject({
      code: 'schema',
      message: 'Schema changed',
    })
  })
})
