import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({
    getConvexClient: () => undefined,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    read: 'read',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: { value: true },
    can: () => ({ value: true }),
  }),
}))

const { CmsStudioQueryError, normalizeCmsStudioQueryError } =
  await import('../../packages/cms/studio-app/src/composables/useCmsStudioQuery')

// §10.8 / "Ginko tests": Studio error mapping must classify through the
// library's shared `ConvexCallError`/`normalizeConvexError` contract, not
// bespoke transport-envelope/JSON/`Symbol.for('functionName')`/substring
// guessing. The library owns kind/code/status/data; Ginko only adds its own
// conflict/not-found/rate-limit/auth business classification on top of the
// `server` kind's structured `data`.

describe('useCmsStudioQuery error normalization (vNext §10.8, ConvexCallError)', () => {
  it('passes an existing ConvexCallError through unchanged in shape', async () => {
    const { ConvexCallError } = await import('better-convex-nuxt/errors')
    const original = new ConvexCallError({
      kind: 'authentication',
      message: 'Not authenticated.',
      status: 401,
    })

    const normalized = normalizeCmsStudioQueryError(original, {} as never)

    expect(normalized).toBeInstanceOf(CmsStudioQueryError)
    expect(normalized.category).toBe('auth')
    expect(normalized.status).toBe(401)
    expect(normalized.message).toBe('Not authenticated.')
  })

  it('classifies a Convex application (server) error by its structured code, never by message text', () => {
    const appError = new ConvexError({ code: 'CONFLICT', message: 'stale write' })

    const normalized = normalizeCmsStudioQueryError(appError, {} as never)

    expect(normalized.category).toBe('conflict')
    expect(normalized.code).toBe('CONFLICT')
    expect(normalized.data).toMatchObject({ code: 'CONFLICT' })
  })

  it('classifies a not-found application error', () => {
    const appError = new ConvexError({ code: 'NOT_FOUND', message: 'missing entry' })

    const normalized = normalizeCmsStudioQueryError(appError, {} as never)

    expect(normalized.category).toBe('not_found')
  })

  it('classifies a rate-limit application error by its LIMIT_ code prefix', () => {
    const appError = new ConvexError({ code: 'LIMIT_EXCEEDED', message: 'slow down' })

    const normalized = normalizeCmsStudioQueryError(appError, {} as never)

    expect(normalized.category).toBe('rate_limit')
  })

  it('classifies transport failures as network, not by inspecting message substrings', async () => {
    const { ConvexCallError } = await import('better-convex-nuxt/errors')
    const transportError = new ConvexCallError({
      kind: 'transport',
      message: 'A network request failed even though the text says CONFLICT and UNAUTH.',
    })

    const normalized = normalizeCmsStudioQueryError(transportError, {} as never)

    expect(normalized.category).toBe('network')
  })

  it('falls back to unknown for an unclassifiable plain error', () => {
    const normalized = normalizeCmsStudioQueryError(new Error('boom'), {} as never)

    expect(normalized.category).toBe('unknown')
  })

  it('is idempotent: re-normalizing an already-normalized error keeps it unchanged', () => {
    const appError = new ConvexError({ code: 'FORBIDDEN', message: 'no access' })
    const first = normalizeCmsStudioQueryError(appError, {} as never)
    const second = normalizeCmsStudioQueryError(first, {} as never)

    expect(second).toBe(first)
  })
})
