import { normalizeConvexError } from 'better-convex-nuxt/errors'
import { serverConvex } from 'better-convex-nuxt/server'
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestWebStream,
  setResponseHeader,
} from 'h3'
import type { H3Event } from 'h3'

import {
  assertCliOperatorRequest,
  isValidOperatorConvexToken,
} from '../utils/operator-token-contract.js'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')

  assertCliOperatorRequest({
    origin: getRequestHeader(event, 'origin'),
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
  })
  await assertEmptyRequestBody(event)

  let token: string | null
  try {
    token = await serverConvex(event, { auth: 'required' }).getToken()
  } catch (error) {
    const normalized = normalizeConvexError(error)
    if (normalized.kind === 'authentication') {
      throw responseError(
        normalized.status === 403 ? 403 : 401,
        'Ginko CMS operator authentication failed.',
      )
    }
    throw responseError(503, 'Ginko CMS operator authentication is unavailable.')
  }

  if (!isValidOperatorConvexToken(token)) {
    throw responseError(503, 'Ginko CMS operator authentication is unavailable.')
  }
  return { token }
})

async function assertEmptyRequestBody(event: H3Event) {
  const contentLength = getRequestHeader(event, 'content-length')
  if (contentLength !== undefined && contentLength !== '0') {
    if (!/^\d+$/u.test(contentLength)) {
      throw responseError(400, 'Invalid operator token request.')
    }
    throw responseError(413, 'Operator token requests do not accept a body.')
  }
  if (getRequestHeader(event, 'transfer-encoding')) {
    throw responseError(413, 'Operator token requests do not accept a body.')
  }

  const body = getRequestWebStream(event)
  if (!body) return
  const reader = body.getReader()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) return
      if (chunk.value && chunk.value.byteLength > 0) {
        await reader.cancel().catch(() => {})
        throw responseError(413, 'Operator token requests do not accept a body.')
      }
    }
  } catch (error) {
    if ((error as { statusCode?: unknown }).statusCode === 413) throw error
    throw responseError(400, 'Invalid operator token request.')
  } finally {
    reader.releaseLock()
  }
}

function responseError(statusCode: number, statusMessage: string) {
  return createError({ statusCode, statusMessage })
}
