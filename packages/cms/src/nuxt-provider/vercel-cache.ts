import type { ContentCacheAdapter } from '@lupinum/ginko-content/provider'
import { setHeader } from 'h3'

export interface VercelContentCacheOptions {
  /** Fixed canonical deployment origin. Never derive this from webhook headers. */
  origin: string
  /** Must match nitro.vercel.config.bypassToken. Keep it server-only. */
  bypassToken: string
  /** Restrict delivery to the host's public content routes. */
  isPublicPath: (path: string) => boolean
  /** Add listing, navigation, or global-content consumers affected by these tags. */
  pathsForTags?: (tags: readonly string[]) => string[]
}

const MAX_PATHS = 100
const DELIVERY_TIMEOUT_MS = 7_500

function publicPath(value: string, origin: string, isPublicPath: (path: string) => boolean) {
  // Reject URL normalization tricks before attaching a credential. The Content
  // boundary normalizes ordinary slashes, but adapters can also be called directly.
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\?#]/u.test(value) ||
    [...value].some((character) => character.charCodeAt(0) <= 32) ||
    /%(?:2e|2f|5c|00)/iu.test(value)
  ) {
    throw new Error('Vercel revalidation requires canonical public paths.')
  }
  const url = new URL(value, origin)
  if (url.origin !== origin || url.pathname !== value || !isPublicPath(value)) {
    throw new Error('Vercel revalidation path is outside the configured public routes.')
  }
  return value
}

/**
 * Uses Content's authenticated revalidation endpoint and the CMS durable outbox.
 * Events carry paths, never historical page bodies: retrying an old event asks
 * the public renderer for its current publication and cannot restore an old draft.
 */
export function vercelContentCache(options: VercelContentCacheOptions): ContentCacheAdapter {
  const origin = new URL(options.origin)
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !options.bypassToken.trim()
  ) {
    throw new Error('Vercel revalidation requires an HTTPS origin and a private bypass token.')
  }

  return {
    name: 'ginko-vercel-isr',
    apply(event, hint) {
      // ISR route rules own shared caching. Do not add another browser/CDN TTL
      // that could continue serving old content after an ISR regeneration.
      if (hint.etag) setHeader(event, 'etag', hint.etag)
      if (hint.lastModified) setHeader(event, 'last-modified', hint.lastModified.toUTCString())
    },
    async invalidate(input) {
      const additional = options.pathsForTags?.(input.tags ?? [])
      const paths = [...new Set([...(input.paths ?? []), ...(additional ?? [])])]
      if (!paths.length || paths.length > MAX_PATHS) {
        throw new Error(`Vercel revalidation requires 1–${MAX_PATHS} resolved public paths.`)
      }
      // Validate the complete batch before the first request; an invalid later
      // path must not cause partial credential-bearing side effects.
      const targets = paths.flatMap((path) => {
        const page = publicPath(path, origin.origin, options.isPublicPath)
        return [page, `${page.replace(/\/$/u, '')}/_payload.json`]
      })
      const queue = [...new Set(targets)]
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
      let failed = false
      try {
        await Promise.all(
          Array.from({ length: Math.min(4, queue.length) }, async () => {
            while (!failed) {
              const path = queue.shift()
              if (!path) return
              try {
                const response = await fetch(new URL(path, origin), {
                  method: 'HEAD',
                  redirect: 'manual',
                  headers: { 'x-prerender-revalidate': options.bypassToken },
                  signal: controller.signal,
                })
                // Redirects, removal, and absent extracted payloads are valid
                // public results. Never follow redirects with the bypass token.
                if (
                  !response.ok &&
                  !(response.status >= 300 && response.status < 400) &&
                  response.status !== 404 &&
                  response.status !== 410
                ) {
                  throw new Error(`Vercel revalidation returned HTTP ${response.status}.`)
                }
                await response.body?.cancel()
              } catch (error) {
                failed = true
                controller.abort()
                throw error
              }
            }
          }),
        )
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
