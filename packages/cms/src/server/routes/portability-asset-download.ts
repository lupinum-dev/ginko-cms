import { serverConvex } from '@lupinum/better-convex-nuxt/server'
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseHeader,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import { assertCliOperatorRequest } from '../utils/operator-token-contract.js'
import {
  downloadPortableAssetStream,
  hashPortableAssetDownloadToken,
  resolvePortableStorageOrigin,
} from '../utils/portability-asset-transport.js'

export default defineEventHandler(async (event) => {
  assertCliOperatorRequest({
    origin: getRequestHeader(event, 'origin'),
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
  })
  const holdId = requiredSha256(getRouterParam(event, 'holdId'))
  const runId = requiredHeader(event, 'x-ginko-portability-run', 256)
  const token = requiredHeader(event, 'x-ginko-portability-attempt', 256)
  const generationValue = requiredHeader(event, 'x-ginko-portability-generation', 16)
  const downloadGeneration = Number(generationValue)
  if (!Number.isSafeInteger(downloadGeneration) || downloadGeneration < 1) {
    throw badRequest('Invalid portability attempt generation.')
  }
  const secret = process.env.GINKO_CMS_PORTABILITY_SECRET?.trim()
  if (!secret) throw unavailable('Portability token sealing is not configured.')
  const runtimeConfig = useRuntimeConfig(event) as { public?: { convex?: { url?: string } } }
  const convexUrl = runtimeConfig.public?.convex?.url
  if (!convexUrl) throw unavailable('Convex deployment URL is not configured.')
  const storageOrigin = resolvePortableStorageOrigin(convexUrl)
  const downloadTokenHash = hashPortableAssetDownloadToken(secret, token)
  const caller = serverConvex(event, { auth: 'required' })
  const claim = await caller.mutation(api.ginkoCms.portability.claimPortableAssetDownload, {
    runId,
    holdId,
    downloadTokenHash,
    downloadGeneration,
  })
  const body = await downloadPortableAssetStream({
    storageUrl: claim.storageUrl,
    storageOrigin,
    expectedBytes: claim.bytes,
    expectedSha256: claim.sha256,
  })
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'content-type', claim.mediaType)
  setResponseHeader(event, 'content-length', claim.bytes)
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  return body
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
  if (!value || !/^[0-9a-f]{64}$/.test(value)) throw badRequest('Invalid portability hold ID.')
  return value
}

function badRequest(message: string) {
  return createError({ statusCode: 400, statusMessage: message })
}

function unavailable(message: string) {
  return createError({ statusCode: 503, statusMessage: message })
}
