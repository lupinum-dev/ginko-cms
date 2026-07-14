import { createAuthMiddleware } from 'better-auth/api'

declare const process: {
  env: Record<string, string | undefined>
}

export type GinkoCredentialKind = 'user-session' | 'mcp-api-key'

type GinkoAuthSession = Record<string, unknown> & {
  ginkoCredentialKind?: GinkoCredentialKind
}

export function requireBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required.')
  }
  return secret
}

export function resolveBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (secret) return secret
  // Convex module analysis and Better Auth schema generation evaluate modules
  // without deployment env vars, so throwing here would fail every convex
  // push (the generated betterAuth/auth.ts constructs auth at import time).
  // A random per-evaluation secret keeps a misconfigured runtime fail-closed:
  // nothing signed with it can ever be verified by another isolate, so no
  // usable credential is issued.
  return `ginko-missing-better-auth-secret-${crypto.randomUUID()}`
}

export function parseBearerApiKey(authorizationHeader?: string | null): string | null {
  const prefix = 'Bearer '
  if (!authorizationHeader?.startsWith(prefix)) return null

  const token = authorizationHeader.slice(prefix.length).trim()
  return token.length > 0 ? token : null
}

/**
 * Marks the synthetic session created only after the Better Auth API-key plugin
 * validates a Bearer credential. The following Convex JWT plugin consumes this
 * server-owned marker; browser session ids are never used as a discriminator.
 */
export function ginkoCredentialKindPlugin() {
  return {
    id: 'ginko-credential-kind',
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string; headers?: Headers | null }) =>
            ctx.path === '/convex/token' &&
            parseBearerApiKey(ctx.headers?.get('authorization')) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.session?.session as GinkoAuthSession | undefined
            if (!session) {
              throw new Error('Validated MCP API-key session is required.')
            }
            session.ginkoCredentialKind = 'mcp-api-key'
            return { context: ctx }
          }),
        },
      ],
    },
  }
}

export function ginkoConvexJwtPayload(input: { session: GinkoAuthSession }): {
  ginkoCredentialKind: GinkoCredentialKind
} {
  return {
    ginkoCredentialKind:
      input.session.ginkoCredentialKind === 'mcp-api-key' ? 'mcp-api-key' : 'user-session',
  }
}
