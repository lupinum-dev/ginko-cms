import type { apiKeyClient } from '@better-auth/api-key/client'
import type { VueAuthClient } from 'better-auth/vue'

/**
 * The narrow client surface Ginko actually uses for MCP API-key management.
 *
 * Derived from the INSTALLED `@better-auth/api-key/client` typings: Better
 * Auth's own `VueAuthClient` inference is applied to the `apiKeyClient()`
 * plugin, then narrowed with `Pick` to just the `apiKey` namespace. This keeps
 * the exact generated `apiKey.create`/`apiKey.delete` signatures without
 * casting the global client or duplicating the whole Better Auth client type.
 * If the pinned api-key package changes its client surface, this type — and any
 * guard below — updates with it.
 */
export type GinkoApiKeyClient = Pick<
  VueAuthClient<{ plugins: [ReturnType<typeof apiKeyClient>] }>,
  'apiKey'
>

/** The exact, actionable capability error surfaced to hosts (vNext §10.2). */
export const GINKO_API_KEY_CLIENT_ERROR =
  'Ginko CMS requires apiKeyClient() from @better-auth/api-key/client. Add it to your convex-auth.ts client definition.'

/**
 * Capability guard: narrow the possibly host-defined `useConvexAuth().client`
 * to the API-key surface Ginko requires before touching `.apiKey`.
 *
 * Backs both the Studio capability check (before rendering API-key management)
 * and §10.5 `createMcpApiKey`. Validates the exact methods Ginko calls
 * (`apiKey.create`) at runtime rather than trusting the compile-time shape,
 * because the host owns the single auth-client definition and may omit the
 * API-key plugin.
 */
export function requireGinkoApiKeyClient(client: unknown): GinkoApiKeyClient {
  const apiKey =
    client && typeof client === 'object' ? (client as { apiKey?: unknown }).apiKey : undefined

  if (
    !apiKey ||
    typeof apiKey !== 'object' ||
    typeof (apiKey as { create?: unknown }).create !== 'function'
  ) {
    throw new Error(GINKO_API_KEY_CLIENT_ERROR)
  }

  return client as GinkoApiKeyClient
}
