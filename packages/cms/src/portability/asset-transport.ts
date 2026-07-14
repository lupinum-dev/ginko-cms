import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import type { PreparedPortableDraftImport } from './commands.js'

const MAX_RESPONSE_BYTES = 4 * 1024
const MAX_COOKIE_BYTES = 4 * 1024
const IDLE_TIMEOUT_MS = 30_000
const TOTAL_TIMEOUT_MS = 2 * 60_000

export type PortableAssetTransferOptions = {
  cmsOrigin: string
  sessionCookie: string
  fetch?: typeof globalThis.fetch
  idleTimeoutMs?: number
  totalTimeoutMs?: number
}

export type PortableExportAsset = {
  holdId: string
  sha256: string
  bytes: number
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  originalFilename: string
}

export async function uploadPreparedPortableDraftImportAssets(
  prepared: PreparedPortableDraftImport,
  options: PortableAssetTransferOptions,
): Promise<void> {
  const origin = resolveCmsOrigin(options.cmsOrigin)
  const cookie = requiredCookie(options.sessionCookie)
  for (const asset of prepared.assets) {
    if (asset.payload.effect !== 'upload') continue
    await uploadAsset(prepared, asset.payload, {
      ...options,
      cmsOrigin: origin,
      sessionCookie: cookie,
    })
  }
}

export async function* downloadPortableExportAsset(
  runId: string,
  asset: PortableExportAsset,
  options: PortableAssetTransferOptions,
): AsyncIterable<Uint8Array> {
  const origin = resolveCmsOrigin(options.cmsOrigin)
  const cookie = requiredCookie(options.sessionCookie)
  const endpoint = new URL(`/api/_ginko/portability/assets/${asset.holdId}`, origin)
  const headers = { cookie, 'x-ginko-portability-run': runId }
  const attemptResponse = await (options.fetch ?? globalThis.fetch)(
    `${endpoint}/download-attempt`,
    {
      method: 'POST',
      headers,
      redirect: 'error',
    },
  )
  const attempt = await readHostJson(attemptResponse)
  if (!isDownloadAttempt(attempt)) {
    throw new Error('CMS portability host returned an invalid download attempt.')
  }
  const abortController = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(
      () => abortController.abort(new Error('Portable asset download idle timeout.')),
      options.idleTimeoutMs ?? IDLE_TIMEOUT_MS,
    )
  }
  const totalTimer = setTimeout(
    () => abortController.abort(new Error('Portable asset download total timeout.')),
    options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS,
  )
  resetIdleTimer()
  const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
    method: 'GET',
    headers: {
      ...headers,
      'x-ginko-portability-attempt': attempt.token,
      'x-ginko-portability-generation': String(attempt.downloadGeneration),
    },
    redirect: 'error',
    signal: abortController.signal,
  })
  if (!response.ok || !response.body) {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
    await response.body?.cancel().catch(() => {})
    throw new Error(`CMS portability host failed with HTTP ${response.status}.`)
  }
  if (
    response.headers.get('content-type') !== asset.mediaType ||
    Number(response.headers.get('content-length')) !== asset.bytes
  ) {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
    await response.body.cancel().catch(() => {})
    throw new Error('CMS portability host returned asset facts that do not match the hold.')
  }
  const reader = response.body.getReader()
  const hash = createHash('sha256')
  let bytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > asset.bytes) throw new Error('Portable asset download exceeds its hold.')
      hash.update(result.value)
      resetIdleTimer()
      yield result.value
    }
    if (bytes !== asset.bytes || hash.digest('hex') !== asset.sha256) {
      throw new Error('Portable asset download does not match its hold.')
    }
  } finally {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
    reader.releaseLock()
  }
}

async function uploadAsset(
  prepared: PreparedPortableDraftImport,
  asset: PreparedPortableDraftImport['assets'][number]['payload'],
  options: PortableAssetTransferOptions,
) {
  const endpoint = new URL(`/api/_ginko/portability/assets/${asset.sha256}`, options.cmsOrigin)
  const headers = {
    cookie: options.sessionCookie,
    'x-ginko-portability-run': prepared.runId,
    'x-ginko-portability-payload': prepared.payloadSha256,
  }
  const attemptResponse = await (options.fetch ?? globalThis.fetch)(`${endpoint}/attempt`, {
    method: 'POST',
    headers,
    redirect: 'error',
  })
  const attempt = await readHostJson(attemptResponse)
  if (isAttached(attempt)) return
  if (!isAttempt(attempt))
    throw new Error('CMS portability host returned an invalid upload attempt.')

  const path = join(
    prepared.directory,
    'public',
    'ginko-assets',
    `${asset.sha256}.${extensionFor(asset.mediaType)}`,
  )
  const abortController = new AbortController()
  const hash = createHash('sha256')
  let bytes = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(
      () => abortController.abort(new Error('Portable asset upload idle timeout.')),
      options.idleTimeoutMs ?? IDLE_TIMEOUT_MS,
    )
  }
  const totalTimer = setTimeout(
    () => abortController.abort(new Error('Portable asset upload total timeout.')),
    options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS,
  )
  resetIdleTimer()
  const source = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
  const body = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength
        if (bytes > asset.bytes) throw new Error('Portable asset exceeds its planned byte length.')
        hash.update(chunk)
        resetIdleTimer()
        controller.enqueue(chunk)
      },
      flush() {
        if (bytes !== asset.bytes)
          throw new Error('Portable asset byte length changed after planning.')
      },
    }),
  )

  try {
    const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      method: 'PUT',
      headers: {
        ...headers,
        'content-type': asset.mediaType,
        'content-length': String(asset.bytes),
        'x-ginko-portability-attempt': attempt.token,
        'x-ginko-portability-generation': String(attempt.attemptGeneration),
      },
      body,
      redirect: 'error',
      signal: abortController.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const result = await readHostJson(response)
    if (bytes !== asset.bytes || hash.digest('hex') !== asset.sha256) {
      throw new Error('Portable asset bytes no longer match the planned hash.')
    }
    if (!isAttached(result)) {
      throw new Error('CMS portability host did not attach the uploaded asset.')
    }
  } finally {
    clearTimeout(totalTimer)
    if (idleTimer) clearTimeout(idleTimer)
  }
}

async function readHostJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`CMS portability host failed with HTTP ${response.status}.`)
  }
  if (!response.body) throw new Error('CMS portability host returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error('CMS portability host response is too large.')
      }
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
    throw new Error('CMS portability host returned invalid JSON.')
  }
}

function resolveCmsOrigin(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('CMS portability origin is invalid.')
  }
  const localhost =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname === '[::1]'
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('CMS portability origin must be an exact secure origin.')
  }
  return url.origin
}

function requiredCookie(value: string) {
  const cookie = value.trim()
  if (!cookie || Buffer.byteLength(cookie) > MAX_COOKIE_BYTES || hasControlCharacters(cookie)) {
    throw new Error('CMS portability session cookie is invalid.')
  }
  return cookie
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function isAttempt(value: unknown): value is {
  state: 'attempt'
  token: string
  attemptGeneration: number
} {
  if (!value || typeof value !== 'object') return false
  const attempt = value as Record<string, unknown>
  return (
    attempt.state === 'attempt' &&
    typeof attempt.token === 'string' &&
    attempt.token.length >= 32 &&
    attempt.token.length <= 256 &&
    Number.isSafeInteger(attempt.attemptGeneration) &&
    Number(attempt.attemptGeneration) >= 1
  )
}

function isAttached(value: unknown): value is { state: 'attached'; assetId: string } {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return (
    result.state === 'attached' && typeof result.assetId === 'string' && result.assetId.length > 0
  )
}

function isDownloadAttempt(value: unknown): value is {
  state: 'attempt'
  token: string
  downloadGeneration: number
} {
  if (!value || typeof value !== 'object') return false
  const attempt = value as Record<string, unknown>
  return (
    attempt.state === 'attempt' &&
    typeof attempt.token === 'string' &&
    attempt.token.length >= 32 &&
    attempt.token.length <= 256 &&
    Number.isSafeInteger(attempt.downloadGeneration) &&
    Number(attempt.downloadGeneration) >= 1
  )
}

function extensionFor(mediaType: string) {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/webp') return 'webp'
  throw new Error('Portable asset media type is unsupported.')
}
