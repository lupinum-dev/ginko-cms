import { serverConvex } from 'better-convex-nuxt/server'
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestWebStream,
  getRouterParam,
  setResponseHeader,
} from 'h3'

import { api } from '#convex/api'

import {
  assertPortableOperatorRequest,
  hashPortableAssetAttemptToken,
  uploadPortableAssetStream,
} from '../utils/portability-asset-transport.js'

export default defineEventHandler(async (event) => {
  assertPortableOperatorRequest({
    origin: getRequestHeader(event, 'origin'),
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
  })
  const sha256 = requiredSha256(getRouterParam(event, 'sha256'))
  const runId = requiredHeader(event, 'x-ginko-portability-run', 256)
  const payloadSha256 = requiredSha256(requiredHeader(event, 'x-ginko-portability-payload', 64))
  const token = requiredHeader(event, 'x-ginko-portability-attempt', 256)
  const generationValue = requiredHeader(event, 'x-ginko-portability-generation', 16)
  const attemptGeneration = Number(generationValue)
  if (!Number.isSafeInteger(attemptGeneration) || attemptGeneration < 1) {
    throw badRequest('Invalid portability attempt generation.')
  }
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) throw unavailable('Portability token sealing is not configured.')
  const attemptTokenHash = hashPortableAssetAttemptToken(secret, token)
  const caller = serverConvex(event, { auth: 'required' })
  const args = {
    runId,
    payloadSha256,
    sha256,
    attemptTokenHash,
    attemptGeneration,
  }
  const stage = await caller.mutation(api.ginkoCms.portability.issuePortableAssetUploadUrl, args)
  if (stage.state === 'attached') {
    setResponseHeader(event, 'cache-control', 'no-store')
    return stage
  }
  if (stage.state === 'awaiting-upload') {
    const contentLength = Number(getRequestHeader(event, 'content-length'))
    if (!Number.isSafeInteger(contentLength) || contentLength !== stage.byteLength) {
      throw badRequest('Portable asset Content-Length does not match the plan.')
    }
    if (getRequestHeader(event, 'content-type') !== stage.mediaType) {
      throw badRequest('Portable asset Content-Type does not match the plan.')
    }
    const source = getRequestWebStream(event) as ReadableStream<Uint8Array> | undefined
    if (!source) throw badRequest('Portable asset request body is required.')
    const uploaded = await uploadPortableAssetStream({
      source,
      uploadUrl: stage.uploadUrl,
      storageOrigin: stage.storageOrigin,
      expectedBytes: stage.byteLength,
      mediaType: stage.mediaType,
    })
    await caller.mutation(api.ginkoCms.portability.recordPortableAssetUpload, {
      ...args,
      storageId: uploaded.storageId,
    })
  }
  const result = await caller.action(api.ginkoCms.portability.verifyPortableAssetUpload, args)
  setResponseHeader(event, 'cache-control', 'no-store')
  return result
})

function requiredHeader(
  event: Parameters<typeof getRequestHeader>[0],
  name: string,
  maxLength: number,
) {
  const value = getRequestHeader(event, name)?.trim()
  if (!value || value.length > maxLength || hasControlCharacters(value)) {
    throw badRequest(`Invalid ${name} header.`)
  }
  return value
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function requiredSha256(value: string | undefined) {
  if (!value || !/^[0-9a-f]{64}$/.test(value)) {
    throw badRequest('Invalid portability SHA-256.')
  }
  return value
}

function badRequest(message: string) {
  return createError({ statusCode: 400, statusMessage: message })
}

function unavailable(message: string) {
  return createError({ statusCode: 503, statusMessage: message })
}
