import type { ConvexHttpClient } from 'convex/browser'

import {
  hasAsciiControlCharacters,
  isValidOperatorConvexToken,
  MAX_OPERATOR_SESSION_COOKIE_BYTES,
  MAX_OPERATOR_TOKEN_RESPONSE_BYTES,
  OPERATOR_CONVEX_TOKEN_ROUTE,
  OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS,
} from '../server/utils/operator-token-contract.js'
import type { ConvexClientFactory } from './args.js'
import { cmsSiteOrigin, operatorSessionCookie, publicConvexUrl } from './env.js'

export type OperatorClient = Pick<ConvexHttpClient, 'query' | 'mutation' | 'action'>

/**
 * Runs owner CLI calls through the same Better Auth user session as Studio.
 * Component authorization remains authoritative; the CLI never receives an
 * admin bypass or forges a caller identity.
 */
export async function createOperatorContext(
  cwd: string,
  convexClientFactory: ConvexClientFactory,
): Promise<{ client: OperatorClient; sessionCookie: string }> {
  const sessionCookie = requireOperatorSessionCookie(operatorSessionCookie(cwd))
  const siteOrigin = resolveOperatorSiteOrigin(cmsSiteOrigin(cwd))
  const convexUrl = publicConvexUrl(cwd)
  const raw = convexClientFactory(convexUrl)
  if (!raw.setAuth) {
    throw new Error('Ginko CMS owner commands require a Convex client with user auth support.')
  }

  let authorization: Promise<void> | undefined
  const authorize = () => {
    authorization ??= exchangeOperatorToken(siteOrigin, sessionCookie).then((token) => {
      try {
        raw.setAuth!(token)
      } catch {
        throw new Error('Ginko CMS operator client could not accept the exchanged token.')
      }
    })
    return authorization
  }

  return {
    sessionCookie,
    client: {
      query: async (reference, value) => {
        await authorize()
        return await raw.query(reference, value)
      },
      mutation: async (reference, value) => {
        await authorize()
        return await raw.mutation(reference, value)
      },
      action: async (reference, value) => {
        await authorize()
        return await raw.action(reference, value)
      },
    },
  }
}

function resolveOperatorSiteOrigin(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('The configured Ginko CMS SITE_URL is invalid.')
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/u.test(url.hostname) ||
    url.hostname === '[::1]'
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('The configured Ginko CMS SITE_URL must be an exact secure origin.')
  }
  return url.origin
}

function requireOperatorSessionCookie(value: string) {
  const cookie = value.trim()
  if (
    !cookie ||
    Buffer.byteLength(cookie) > MAX_OPERATOR_SESSION_COOKIE_BYTES ||
    hasAsciiControlCharacters(cookie)
  ) {
    throw new Error('The Ginko CMS operator session cookie is invalid.')
  }
  return cookie
}

async function exchangeOperatorToken(siteOrigin: string, sessionCookie: string) {
  const endpoint = new URL(OPERATOR_CONVEX_TOKEN_ROUTE, siteOrigin)
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          cookie: sessionCookie,
          'content-length': '0',
        },
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: abortController.signal,
      })
    } catch {
      if (abortController.signal.aborted) {
        throw exchangeError('Ginko CMS operator token exchange timed out.')
      }
      throw exchangeError(
        'Ginko CMS operator token exchange could not reach the configured SITE_URL.',
      )
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      if (response.status === 401 || response.status === 403) {
        throw exchangeError(
          `Ginko CMS operator authentication failed with HTTP ${response.status}.`,
        )
      }
      throw exchangeError(`Ginko CMS operator token exchange failed with HTTP ${response.status}.`)
    }

    let payload: unknown
    try {
      payload = await readBoundedOperatorResponse(response)
    } catch (error) {
      if (abortController.signal.aborted) {
        throw exchangeError('Ginko CMS operator token exchange timed out.')
      }
      if (error instanceof OperatorTokenExchangeError) throw error
      throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
    }
    const token =
      payload && typeof payload === 'object' ? (payload as { token?: unknown }).token : undefined
    if (!isValidOperatorConvexToken(token)) {
      throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
    }
    return token
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedOperatorResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length')
  if (
    declaredLength !== null &&
    (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_OPERATOR_TOKEN_RESPONSE_BYTES)
  ) {
    await response.body?.cancel().catch(() => {})
    throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
  }
  if (!response.body) {
    throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > MAX_OPERATOR_TOKEN_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
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
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw exchangeError('Ginko CMS operator token exchange returned an invalid response.')
  }
}

class OperatorTokenExchangeError extends Error {}

function exchangeError(message: string) {
  return new OperatorTokenExchangeError(message)
}
