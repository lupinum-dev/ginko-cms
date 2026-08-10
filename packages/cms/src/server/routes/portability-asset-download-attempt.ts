import { serverConvex } from 'better-convex-nuxt/server'
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseHeader,
} from 'h3'

import { api } from '#convex/api'

import { assertCliOperatorRequest } from '../utils/operator-token-contract.js'
import { createPortableAssetDownloadAttempt } from '../utils/portability-asset-transport.js'

export default defineEventHandler(async (event) => {
  assertCliOperatorRequest({
    origin: getRequestHeader(event, 'origin'),
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
  })
  const holdId = requiredSha256(getRouterParam(event, 'holdId'))
  const runId = requiredHeader(event, 'x-ginko-portability-run', 256)
  const secret = process.env.GINKO_CMS_PORTABILITY_SECRET?.trim()
  if (!secret) throw unavailable('Portability token sealing is not configured.')
  const attempt = createPortableAssetDownloadAttempt(secret)
  const caller = serverConvex(event, { auth: 'required' })
  const result = await caller.mutation(api.ginkoCms.portability.beginPortableAssetDownload, {
    runId,
    holdId,
    downloadTokenHash: attempt.tokenHash,
  })
  setResponseHeader(event, 'cache-control', 'no-store')
  return { ...result, token: attempt.token }
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
    throw createError({ statusCode: 400, statusMessage: 'Invalid portability hold ID.' })
  }
  return value
}

function unavailable(message: string) {
  return createError({ statusCode: 503, statusMessage: message })
}
