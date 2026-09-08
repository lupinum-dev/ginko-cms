import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { serverConvex } from '@lupinum/better-convex-nuxt/server'
import {
  createError,
  defineEventHandler,
  getQuery,
  getRequestURL,
  sendRedirect,
  setResponseHeader,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import {
  decodeOperatorBrowserRequest,
  isValidOperatorConvexToken,
} from '../utils/operator-token-contract.js'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(
    event,
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action http://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'",
  )
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')

  const query = getQuery(event)
  let callback: URL
  let state: string
  try {
    ;({ callback, state } = decodeOperatorBrowserRequest(query.request))
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }

  let token: string | null
  try {
    token = await serverConvex(event, { auth: 'required' }).getToken()
  } catch (error) {
    const normalized = normalizeConvexError(error)
    if (normalized.kind === 'authentication') {
      const route =
        (useRuntimeConfig(event).public.ginkoCms as { route?: string } | undefined)?.route ??
        '/studio'
      const request = getRequestURL(event)
      return await sendRedirect(
        event,
        `${route.replace(/\/$/u, '')}/auth/signin?redirect=${encodeURIComponent(`${request.pathname}${request.search}`)}`,
        302,
      )
    }
    throw createError({
      statusCode: 503,
      statusMessage: 'Ginko CMS operator authentication is unavailable.',
    })
  }
  if (!isValidOperatorConvexToken(token)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Ginko CMS operator authentication is unavailable.',
    })
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Ginko CMS migration</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:1.5rem;color:#18181b}button{font:inherit;padding:.7rem 1rem}code{overflow-wrap:anywhere}</style></head><body><h1>Continue Ginko CMS migration</h1><p>You are signed in. Continue to give the waiting local CLI at <code>${escapeHtml(callback.origin)}</code> a short-lived operator token for this site's configured deployment. No cookie or password is copied.</p><form method="post" action="${escapeHtml(callback.href)}"><input type="hidden" name="state" value="${state}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Continue migration</button></form></body></html>`
})

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
