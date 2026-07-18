import { normalizeConvexError } from 'better-convex-nuxt/errors'
import { serverConvex } from 'better-convex-nuxt/server'
import type { ConvexHttpClient } from 'convex/browser'
import type { H3Event } from 'h3'

import type { ConvexClientFactory } from './args.js'
import { convexSiteOrigin, operatorSessionCookie, publicConvexUrl } from './env.js'

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
  const sessionCookie = operatorSessionCookie(cwd)
  const siteOrigin = convexSiteOrigin(cwd)
  const convexUrl = publicConvexUrl(cwd)
  const raw = convexClientFactory(convexUrl)
  if (!raw.setAuth) {
    throw new Error('Ginko CMS owner commands require a Convex client with user auth support.')
  }

  const authorize = async () => {
    const event = {
      context: {
        nitro: {
          runtimeConfig: {
            public: {
              convex: { url: convexUrl, siteUrl: siteOrigin },
            },
          },
        },
      },
      headers: new Headers(),
    } as unknown as H3Event
    let token: string | null
    try {
      token = await serverConvex(event, {
        credential: { type: 'cookie', value: sessionCookie },
      }).getToken()
    } catch (error) {
      const normalized = normalizeConvexError(error)
      if (normalized.kind === 'authentication') {
        throw new Error(
          `Ginko CMS operator authentication failed${normalized.status ? ` with HTTP ${normalized.status}` : ''}.`,
        )
      }
      throw error
    }
    if (!token) throw new Error('Ginko CMS operator authentication failed.')
    raw.setAuth!(token)
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
