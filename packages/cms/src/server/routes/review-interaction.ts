import {
  createError,
  defineEventHandler,
  getRouterParam,
  sendRedirect,
  setResponseHeader,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

const reviewIdPattern = /^[\w-]{1,128}$/u

function validStudioRoute(value: string) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('?') &&
    !value.includes('#') &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  )
}

export default defineEventHandler(async (event) => {
  const reviewRequestId = getRouterParam(event, 'reviewRequestId')
  if (!reviewRequestId || !reviewIdPattern.test(reviewRequestId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review request.' })
  }

  const runtimeConfig = useRuntimeConfig(event) as {
    public?: { ginkoCms?: { route?: string } }
  }
  const configuredRoute = runtimeConfig.public?.ginkoCms?.route ?? '/studio'
  if (!validStudioRoute(configuredRoute)) {
    throw createError({ statusCode: 500, statusMessage: 'Invalid Studio route configuration.' })
  }
  const studioRoute = configuredRoute.replace(/\/$/u, '') || '/studio'
  const query = new URLSearchParams({ review: reviewRequestId })

  setResponseHeader(event, 'cache-control', 'private, no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  setResponseHeader(event, 'x-robots-tag', 'noindex, nofollow')
  return await sendRedirect(event, `${studioRoute}/reviews?${query.toString()}`, 302)
})
