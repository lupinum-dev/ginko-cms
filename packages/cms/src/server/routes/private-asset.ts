import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { serverConvex } from '@lupinum/better-convex-nuxt/server'
import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
  PRIVATE_ASSET_CHUNK_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import {
  createError,
  defineEventHandler,
  getMethod,
  getRequestHeader,
  getRouterParam,
  setResponseHeader,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { resolvePortableStorageOrigin } from '../utils/portability-asset-transport.js'

const allowedMediaTypes = new Set<string>(ALLOWED_ASSET_MIME_TYPES)
type ChunkIdentity = { total: number; mediaType: string; version: string }

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'private, no-store')
  setResponseHeader(event, 'vary', 'Cookie, Authorization')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  setResponseHeader(event, 'cross-origin-resource-policy', 'same-origin')
  if (getMethod(event) !== 'GET') throw failure(405)
  if (getRequestHeader(event, 'range') !== undefined) throw failure(416)
  const assetId = getRouterParam(event, 'assetId')
  if (!assetId || !/^[\w-]{1,128}$/u.test(assetId)) throw failure(400)

  let token: string | null
  try {
    token = await serverConvex(event, { auth: 'required' }).getToken()
  } catch (error) {
    const normalized = normalizeConvexError(error)
    throw failure(normalized.kind === 'authentication' ? 401 : 503)
  }
  if (!token) throw failure(401)
  const config = useRuntimeConfig(event) as { public?: { convex?: { siteUrl?: string } } }
  let site: string
  try {
    site = resolvePortableStorageOrigin(config.public?.convex?.siteUrl ?? '')
  } catch {
    throw failure(503)
  }
  const cancelled = new AbortController()
  // H3's Web ReadableStream adapter does not propagate Node response close
  // into stream.cancel(), including while the first chunk is being fetched.
  const onClose = () => {
    cancelled.abort()
    cleanup()
  }
  const cleanup = () => event.node.res.off('close', onClose)
  event.node.res.once('close', onClose)
  if (event.node.res.destroyed) cancelled.abort()
  let first: Awaited<ReturnType<typeof readChunk>>
  try {
    first = await readChunk(0)
  } catch (error) {
    cancelled.abort()
    cleanup()
    throw error
  }
  setResponseHeader(event, 'content-type', first.mediaType)
  setResponseHeader(event, 'content-length', first.total)
  let offset = 0
  // Convex sends bounded chunks. Only the Nuxt host assembles the full stream,
  // preserving assets above Convex's 20 MB HTTP-response limit. Each next
  // chunk reauthorizes and must match the original immutable content hash.
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = offset === 0 ? first : await readChunk(offset, first)
        controller.enqueue(chunk.bytes)
        offset += chunk.bytes.byteLength
        if (offset === first.total) {
          cleanup()
          controller.close()
        }
      } catch {
        cancelled.abort()
        cleanup()
        controller.error(new Error('Private asset delivery failed.'))
      }
    },
    cancel() {
      cancelled.abort()
      cleanup()
    },
  })

  async function readChunk(offset: number, expected?: ChunkIdentity) {
    const url = new URL(`/ginko/assets/${assetId}`, site)
    if (offset) url.searchParams.set('offset', String(offset))
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (expected) headers['x-ginko-asset-version'] = expected.version
    let response: Response
    try {
      response = await fetch(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.any([cancelled.signal, AbortSignal.timeout(15_000)]),
      })
    } catch {
      throw failure(502)
    }
    const mediaType = response.headers.get('content-type') ?? ''
    const length = Number(response.headers.get('content-length'))
    const total = Number(response.headers.get('x-ginko-asset-bytes'))
    const version = response.headers.get('x-ginko-asset-version') ?? ''
    const actualOffset = response.headers.get('x-ginko-asset-offset')
    if (
      response.status !== 200 ||
      !response.body ||
      !allowedMediaTypes.has(mediaType) ||
      !Number.isSafeInteger(total) ||
      total < 1 ||
      total > MAX_ASSET_SIZE_BYTES ||
      actualOffset !== String(offset) ||
      !/^[a-f0-9]{64}$/.test(version) ||
      length !== Math.min(PRIVATE_ASSET_CHUNK_BYTES, total - offset) ||
      length < 1 ||
      (expected &&
        (expected.total !== total ||
          expected.mediaType !== mediaType ||
          expected.version !== version))
    ) {
      await response.body?.cancel().catch(() => {})
      throw failure([401, 403, 404, 409, 416].includes(response.status) ? response.status : 502)
    }
    const bytes = new Uint8Array(length)
    const reader = response.body.getReader()
    let received = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        if (received + part.value.byteLength > length) throw failure(502)
        bytes.set(part.value, received)
        received += part.value.byteLength
      }
      if (received !== length) throw failure(502)
    } catch {
      throw failure(502)
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    return { bytes, total, mediaType, version }
  }
})

function failure(statusCode: number) {
  return createError({ statusCode, statusMessage: 'Private asset is unavailable.' })
}
