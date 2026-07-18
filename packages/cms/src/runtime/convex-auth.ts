import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

/**
 * Ginko's fallback Better Auth client definition.
 *
 * Better Convex Nuxt owns resolution and instantiation of the single auth
 * client. CMS-owned MCP service credentials do not extend the browser auth
 * client, so the fallback intentionally uses only Better Auth's base surface.
 */
export default defineConvexAuthClient()
