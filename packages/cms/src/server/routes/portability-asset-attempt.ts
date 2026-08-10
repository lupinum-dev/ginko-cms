import { serverConvex } from 'better-convex-nuxt/server'
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
  createPortableAssetAttempt,
  resolvePortableStorageOrigin,
} from '../utils/portability-asset-transport.js'

export default defineEventHandler(async (event) => {
  assertCliOperatorRequest({
    origin: getRequestHeader(event, 'origin'),
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
  })
  const sha256 = requiredSha256(getRouterParam(event, 'sha256'))
  const runId = requiredHeader(event, 'x-ginko-portability-run', 256)
  const payloadSha256 = requiredSha256(requiredHeader(event, 'x-ginko-portability-payload', 64))
  const secret = process.env.GINKO_CMS_PORTABILITY_SECRET?.trim()
  if (!secret) throw unavailable('Portability token sealing is not configured.')
  const runtimeConfig = useRuntimeConfig(event) as { public?: { convex?: { url?: string } } }
  const convexUrl = runtimeConfig.public?.convex?.url
  if (!convexUrl) throw unavailable('Convex deployment URL is not configured.')
  const storageOrigin = resolvePortableStorageOrigin(convexUrl)
  const attempt = createPortableAssetAttempt(secret)
  const caller = serverConvex(event, { auth: 'required' })
  const result = await caller.mutation(api.ginkoCms.portability.beginPortableAssetUpload, {
    runId,
    payloadSha256,
    sha256,
    attemptTokenHash: attempt.tokenHash,
    storageOrigin,
  })
  setResponseHeader(event, 'cache-control', 'no-store')
  return result.state === 'attached' ? result : { ...result, token: attempt.token }
})

function requiredHeader(
  event: Parameters<typeof getRequestHeader>[0],
  name: string,
  maxLength: number,
) {
  const value = getRequestHeader(event, name)?.trim()
  if (!value || value.length > maxLength || hasControlCharacters(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${name} header.` })
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
    throw createError({ statusCode: 400, statusMessage: 'Invalid portability SHA-256.' })
  }
  return value
}

function unavailable(message: string) {
  return createError({ statusCode: 503, statusMessage: message })
}
