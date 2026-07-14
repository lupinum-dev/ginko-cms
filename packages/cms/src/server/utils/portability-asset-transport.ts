import { createHash, createHmac, randomBytes } from 'node:crypto'

const MAX_PORTABLE_ASSET_BYTES = 25 * 1024 * 1024
const PORTABLE_ASSET_IDLE_TIMEOUT_MS = 30_000
const PORTABLE_ASSET_TOTAL_TIMEOUT_MS = 2 * 60_000
const MAX_UPLOAD_RESPONSE_BYTES = 4 * 1024
const TOKEN_HASH_DOMAIN = 'ginko-cms:portability-asset-attempt:v1\0'
const DOWNLOAD_TOKEN_HASH_DOMAIN = 'ginko-cms:portability-asset-download:v1\0'

type PortableMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export function assertPortableOperatorRequest(input: {
  origin?: string | null
  secFetchSite?: string | null
}) {
  if (input.origin || input.secFetchSite) {
    throw Object.assign(new Error('Portability transfer requires a CLI operator request.'), {
      statusCode: 403,
      statusMessage: 'Portability transfer requires a CLI operator request.',
    })
  }
}

export function resolvePortableStorageOrigin(convexUrl: string) {
  let url: URL
  try {
    url = new URL(convexUrl)
  } catch {
    throw new Error('Configured Convex URL is invalid.')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Configured Convex URL must be an exact secure deployment origin.')
  }
  return url.origin
}

export function createPortableAssetAttempt(secret: string) {
  if (!secret) throw new Error('Portability token secret is not configured.')
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: createHmac('sha256', secret).update(TOKEN_HASH_DOMAIN).update(token).digest('hex'),
  }
}

export function hashPortableAssetAttemptToken(secret: string, token: string) {
  if (!secret || !token) throw new Error('Portability upload token is invalid.')
  return createHmac('sha256', secret).update(TOKEN_HASH_DOMAIN).update(token).digest('hex')
}

export function createPortableAssetDownloadAttempt(secret: string) {
  if (!secret) throw new Error('Portability token secret is not configured.')
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: createHmac('sha256', secret)
      .update(DOWNLOAD_TOKEN_HASH_DOMAIN)
      .update(token)
      .digest('hex'),
  }
}

export function hashPortableAssetDownloadToken(secret: string, token: string) {
  if (!secret || !token) throw new Error('Portability download token is invalid.')
  return createHmac('sha256', secret).update(DOWNLOAD_TOKEN_HASH_DOMAIN).update(token).digest('hex')
}

export async function downloadPortableAssetStream(input: {
  storageUrl: string
  storageOrigin: string
  expectedBytes: number
  expectedSha256: string
  fetch?: typeof globalThis.fetch
  idleTimeoutMs?: number
  totalTimeoutMs?: number
}): Promise<ReadableStream<Uint8Array>> {
  if (
    !Number.isSafeInteger(input.expectedBytes) ||
    input.expectedBytes < 1 ||
    input.expectedBytes > MAX_PORTABLE_ASSET_BYTES ||
    !/^[0-9a-f]{64}$/.test(input.expectedSha256)
  ) {
    throw new Error('Portable asset download facts are invalid.')
  }
  const storageOrigin = new URL(input.storageOrigin)
  const storageUrl = new URL(input.storageUrl)
  if (
    storageOrigin.protocol !== 'https:' ||
    storageOrigin.origin !== input.storageOrigin ||
    storageUrl.origin !== storageOrigin.origin ||
    storageUrl.username ||
    storageUrl.password
  ) {
    throw new Error('Portable asset download URL has an unexpected origin.')
  }
  const abortController = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(
      () => abortController.abort(new Error('Portable asset download idle timeout.')),
      input.idleTimeoutMs ?? PORTABLE_ASSET_IDLE_TIMEOUT_MS,
    )
  }
  const totalTimer = setTimeout(
    () => abortController.abort(new Error('Portable asset download total timeout.')),
    input.totalTimeoutMs ?? PORTABLE_ASSET_TOTAL_TIMEOUT_MS,
  )
  const clearTimers = () => {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
  }
  resetIdleTimer()
  let response: Response
  try {
    response = await (input.fetch ?? globalThis.fetch)(storageUrl, {
      method: 'GET',
      redirect: 'error',
      signal: abortController.signal,
    })
  } catch (error) {
    clearTimers()
    throw error
  }
  if (!response.ok || !response.body) {
    clearTimers()
    await response.body?.cancel().catch(() => {})
    throw new Error(`Portable asset storage download failed with HTTP ${response.status}.`)
  }
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) !== input.expectedBytes) {
    clearTimers()
    await response.body.cancel().catch(() => {})
    throw new Error('Portable asset storage length does not match its hold.')
  }
  let receivedBytes = 0
  const hash = createHash('sha256')
  return response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength
        if (receivedBytes > input.expectedBytes) {
          throw new Error('Portable asset storage body exceeds its hold.')
        }
        hash.update(chunk)
        resetIdleTimer()
        controller.enqueue(chunk)
      },
      flush() {
        clearTimers()
        if (receivedBytes !== input.expectedBytes || hash.digest('hex') !== input.expectedSha256) {
          throw new Error('Portable asset storage body does not match its hold.')
        }
      },
    }),
  )
}

export async function uploadPortableAssetStream(input: {
  source: ReadableStream<Uint8Array>
  uploadUrl: string
  storageOrigin: string
  expectedBytes: number
  mediaType: PortableMediaType
  fetch?: typeof globalThis.fetch
  idleTimeoutMs?: number
  totalTimeoutMs?: number
}): Promise<{ storageId: string; bytes: number }> {
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes < 1) {
    throw new Error('Portable asset byte length is invalid.')
  }
  if (input.expectedBytes > MAX_PORTABLE_ASSET_BYTES) {
    throw new Error('Portable asset exceeds the 25 MiB limit.')
  }
  const storageOrigin = new URL(input.storageOrigin)
  const uploadUrl = new URL(input.uploadUrl)
  if (
    storageOrigin.protocol !== 'https:' ||
    storageOrigin.origin !== input.storageOrigin ||
    uploadUrl.origin !== storageOrigin.origin ||
    uploadUrl.username ||
    uploadUrl.password
  ) {
    throw new Error('Portable asset upload URL has an unexpected origin.')
  }

  const abortController = new AbortController()
  let receivedBytes = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(
      () => abortController.abort(new Error('Portable asset upload idle timeout.')),
      input.idleTimeoutMs ?? PORTABLE_ASSET_IDLE_TIMEOUT_MS,
    )
  }
  const totalTimer = setTimeout(
    () => abortController.abort(new Error('Portable asset upload total timeout.')),
    input.totalTimeoutMs ?? PORTABLE_ASSET_TOTAL_TIMEOUT_MS,
  )
  resetIdleTimer()

  const exactBody = input.source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength
        if (receivedBytes > input.expectedBytes) {
          throw new Error('Portable asset byte length exceeds the planned length.')
        }
        resetIdleTimer()
        controller.enqueue(chunk)
      },
      flush() {
        if (receivedBytes !== input.expectedBytes) {
          throw new Error('Portable asset byte length does not match the planned length.')
        }
      },
    }),
  )

  try {
    const response = await (input.fetch ?? globalThis.fetch)(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': input.mediaType },
      body: exactBody,
      redirect: 'error',
      signal: abortController.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`Portable asset storage upload failed with HTTP ${response.status}.`)
    }
    const payload = await readBoundedJson(response, MAX_UPLOAD_RESPONSE_BYTES)
    const storageId =
      payload && typeof payload === 'object' ? (payload as { storageId?: unknown }).storageId : null
    if (typeof storageId !== 'string' || !storageId) {
      throw new Error('Portable asset storage upload returned no storage ID.')
    }
    return { storageId, bytes: receivedBytes }
  } finally {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
  }
}

async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  if (!response.body) throw new Error('Portable asset storage upload returned an empty body.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > limit) throw new Error('Portable asset storage response is too large.')
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error('Portable asset storage response is invalid JSON.')
  }
}
