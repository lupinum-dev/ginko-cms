import { exchangeConvexToken } from 'better-convex-nuxt/server'
import type { ConvexHttpClient } from 'convex/browser'

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
  const raw = convexClientFactory(publicConvexUrl(cwd))
  if (!raw.setAuth) {
    throw new Error('Ginko CMS owner commands require a Convex client with user auth support.')
  }

  const authorize = async () => {
    const exchanged = await exchangeConvexToken({
      siteUrl: siteOrigin,
      credential: { type: 'cookie', value: sessionCookie },
    })
    if (!exchanged.token) {
      throw new Error(
        `Ginko CMS operator authentication failed${exchanged.status ? ` with HTTP ${exchanged.status}` : ''}.`,
      )
    }
    raw.setAuth!(exchanged.token)
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
