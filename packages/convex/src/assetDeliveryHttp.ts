import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
  PRIVATE_ASSET_CHUNK_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import {
  cmsCallerFromActionAuthIdentity,
  type CmsCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type {
  FunctionReference,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
} from 'convex/server'

export type AssetDeliveryDescriptor = {
  url: string
  mimeType: string
  bytes: number
  sha256: string
}
type DeliveryQuery = FunctionReference<
  'query',
  FunctionVisibility,
  { assetId: string; _trustedCaller?: CmsCaller },
  AssetDeliveryDescriptor | null
>
const privateHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  vary: 'Authorization, Cookie',
}
const allowedMediaTypes = new Set<string>(ALLOWED_ASSET_MIME_TYPES)

function failure(status: number) {
  return new Response(null, { status, headers: privateHeaders })
}

/** Host HTTP transport only. No public query may expose the descriptor. */
export async function handleGinkoAssetRequest(
  ctx: Pick<GenericActionCtx<GenericDataModel>, 'auth' | 'runQuery'>,
  request: Request,
  input: { descriptorQuery: DeliveryQuery; storageOrigin: string; fetch?: typeof globalThis.fetch },
) {
  if (request.method !== 'GET') return failure(405)
  if (request.headers.has('range')) return failure(416)
  const requestUrl = new URL(request.url)
  const assetId = requestUrl.pathname.match(/^\/ginko\/assets\/([\w-]{1,128})$/u)?.[1]
  if (!assetId) return failure(404)
  const rawOffset = requestUrl.searchParams.get('offset') ?? '0'
  const offset = Number(rawOffset)
  if (
    !/^\d+$/.test(rawOffset) ||
    !Number.isSafeInteger(offset) ||
    offset % PRIVATE_ASSET_CHUNK_BYTES !== 0
  )
    return failure(416)
  let caller: ReturnType<typeof cmsCallerFromActionAuthIdentity>
  try {
    caller = cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity())
  } catch {
    return failure(503)
  }
  if (!caller || caller.kind !== 'user') return failure(401)
  const read = () => ctx.runQuery(input.descriptorQuery, { assetId, _trustedCaller: caller })
  let descriptor: AssetDeliveryDescriptor | null
  try {
    descriptor = await read()
  } catch {
    return failure(403)
  }
  if (!descriptor) return failure(404)
  if (offset >= descriptor.bytes) return failure(416)
  const expectedVersion = request.headers.get('x-ginko-asset-version')
  if (
    (offset > 0 && !expectedVersion) ||
    (expectedVersion && expectedVersion !== descriptor.sha256)
  )
    return failure(409)

  const abort = new AbortController()
  const deadline = setTimeout(() => abort.abort(), 15_000)
  const cancel = () => abort.abort()
  request.signal.addEventListener('abort', cancel, { once: true })
  if (request.signal.aborted) abort.abort()
  let upstream: Response | undefined
  try {
    const origin = new URL(input.storageOrigin)
    const url = new URL(descriptor.url)
    const local =
      origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if (
      (origin.protocol !== 'https:' && !local) ||
      origin.origin !== input.storageOrigin ||
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      !Number.isSafeInteger(descriptor.bytes) ||
      descriptor.bytes < 1 ||
      descriptor.bytes > MAX_ASSET_SIZE_BYTES ||
      !allowedMediaTypes.has(descriptor.mimeType) ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256)
    )
      throw new Error('Invalid delivery descriptor.')
    const length = Math.min(PRIVATE_ASSET_CHUNK_BYTES, descriptor.bytes - offset)
    // The user token terminates at Convex; it is never sent to storage. Range
    // bounds come only from the authorized descriptor and validated offset.
    upstream = await (input.fetch ?? globalThis.fetch)(url, {
      method: 'GET',
      redirect: 'error',
      signal: abort.signal,
      headers: { 'accept-encoding': 'identity', range: `bytes=${offset}-${offset + length - 1}` },
    })
    const ranged = upstream.status === 206
    const sourceBytes = ranged ? length : descriptor.bytes
    if (
      (!ranged && upstream.status !== 200) ||
      !upstream.body ||
      (ranged &&
        upstream.headers.get('content-range') !==
          `bytes ${offset}-${offset + length - 1}/${descriptor.bytes}`) ||
      (upstream.headers.has('content-encoding') &&
        upstream.headers.get('content-encoding') !== 'identity') ||
      (upstream.headers.has('content-length') &&
        Number(upstream.headers.get('content-length')) !== sourceBytes)
    )
      throw new Error('Invalid storage response.')
    // A provider that ignores Range is still safe: discard its prefix, retain
    // at most one chunk, and cancel as soon as the required bytes are read.
    const bytes = await readChunk(upstream.body, ranged ? 0 : offset, length, sourceBytes)
    // Recheck after downloading the chunk, before releasing even its first
    // byte. A revoke, replacement or trash operation must defeat the request.
    let current: AssetDeliveryDescriptor | null
    try {
      current = await read()
    } catch {
      return failure(403)
    }
    if (
      !current ||
      current.url !== descriptor.url ||
      current.mimeType !== descriptor.mimeType ||
      current.bytes !== descriptor.bytes ||
      current.sha256 !== descriptor.sha256
    )
      return failure(409)
    abort.signal.throwIfAborted()
    return new Response(bytes, {
      headers: {
        ...privateHeaders,
        'content-type': descriptor.mimeType,
        'content-length': String(length),
        'x-ginko-asset-bytes': String(descriptor.bytes),
        'x-ginko-asset-offset': String(offset),
        'x-ginko-asset-version': descriptor.sha256,
      },
    })
  } catch {
    return failure(502)
  } finally {
    abort.abort()
    clearTimeout(deadline)
    request.signal.removeEventListener('abort', cancel)
    await upstream?.body?.cancel().catch(() => {})
  }
}

async function readChunk(
  body: ReadableStream<Uint8Array>,
  offset: number,
  length: number,
  sourceBytes: number,
) {
  const reader = body.getReader()
  const result = new Uint8Array(length)
  let received = 0
  let written = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      const start = received
      received += chunk.value.byteLength
      if (received > sourceBytes) throw new Error('Invalid storage length.')
      const from = Math.max(0, offset - start)
      const to = Math.min(chunk.value.byteLength, offset + length - start)
      if (to > from) {
        result.set(chunk.value.subarray(from, to), written)
        written += to - from
      }
      if (written === length && offset + length < sourceBytes) break
    }
    if (written !== length) throw new Error('Truncated storage chunk.')
    return result
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
