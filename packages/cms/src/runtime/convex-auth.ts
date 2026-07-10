import { apiKeyClient } from '@better-auth/api-key/client'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

/**
 * Ginko's fallback Better Auth client definition.
 *
 * Better Convex Nuxt owns resolution and instantiation of the single auth
 * client (vNext §8/§10.2). Ginko supplies this definition only as a fallback
 * (see `moduleDependencies` in `../module.ts`): when the host has not disabled
 * Convex/auth, has not configured `convex.auth.client`, and has no
 * `<srcDir>/convex-auth.ts` convention file. It adds the API-key client plugin
 * so the Studio can create MCP API keys.
 */
export default defineConvexAuthClient({
  plugins: [apiKeyClient()],
})
