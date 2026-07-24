const subject = {
  user: (value: string): `user:${string}` => `user:${value.trim()}`,
  agent: (value: string): `agent:${string}` => `agent:${value.trim()}`,
  deploy: (value: string): `service:${string}` => `service:deploy:${value.trim()}`,
  anonymous: (): 'system:anonymous' => 'system:anonymous',
} as const

export type CmsAnonymousCaller = {
  kind: 'anonymous'
  subject: 'system:anonymous'
}

export type CmsUserCaller = {
  kind: 'user'
  userId: string
  subject: `user:${string}`
  name?: string
  email?: string
  emailVerified?: boolean
}

export type CmsMcpCaller = {
  kind: 'mcp'
  issuer: string
  userId: string
  clientId: string
  scopes: string[]
  subject: `agent:${string}`
}

export type CmsDeployCaller = {
  kind: 'deploy'
  deployId: string
  subject: `service:${string}`
}

export type CmsCaller = CmsAnonymousCaller | CmsUserCaller | CmsMcpCaller | CmsDeployCaller

export function getExpectedCmsCallerSubject(caller: CmsCaller): CmsCaller['subject'] {
  switch (caller.kind) {
    case 'anonymous':
      return subject.anonymous()
    case 'user':
      return subject.user(caller.userId)
    case 'mcp':
      return subject.agent(
        [caller.issuer, caller.userId, caller.clientId].map(encodeURIComponent).join(':'),
      )
    case 'deploy':
      return subject.deploy(caller.deployId)
  }
}

export function assertCmsCallerConsistency(caller: CmsCaller): CmsCaller {
  const expectedSubject = getExpectedCmsCallerSubject(caller)
  if (caller.subject !== expectedSubject) {
    switch (caller.kind) {
      case 'anonymous':
        throw new Error('CMS anonymous caller must use subject "system:anonymous".')
      case 'user':
        throw new Error('CMS user caller subject must match the userId.')
      case 'mcp':
        throw new Error('CMS MCP caller subject must match its verified OAuth identity.')
      case 'deploy':
        throw new Error('CMS deploy caller subject must match the deployId.')
    }
  }

  return caller
}

export function cmsAnonymousCaller(): CmsAnonymousCaller {
  return {
    kind: 'anonymous',
    subject: subject.anonymous(),
  }
}

export function cmsUserCaller(
  userId: string,
  profile?: {
    name?: string | null
    email?: string | null
    emailVerified?: boolean | null
  },
): CmsUserCaller {
  return {
    kind: 'user',
    userId,
    subject: subject.user(userId),
    ...(profile?.name ? { name: profile.name } : {}),
    ...(profile?.email ? { email: profile.email } : {}),
    ...(typeof profile?.emailVerified === 'boolean'
      ? { emailVerified: profile.emailVerified }
      : {}),
  }
}

export function cmsMcpCaller(input: {
  issuer: string
  userId: string
  clientId: string
  scopes: readonly string[]
}): CmsMcpCaller {
  const identity = [input.issuer, input.userId, input.clientId].map(encodeURIComponent).join(':')
  return {
    kind: 'mcp',
    issuer: input.issuer,
    userId: input.userId,
    clientId: input.clientId,
    scopes: [...input.scopes],
    subject: subject.agent(identity),
  }
}

export function cmsCallerFromConvexAuthIdentity(identity: {
  subject?: string | null
  name?: string | null
  email?: string | null
  emailVerified?: boolean | null
}): CmsUserCaller {
  return cmsUserCaller(identity.subject ?? '', {
    name: identity.name,
    email: identity.email,
    emailVerified: identity.emailVerified,
  })
}

/**
 * Builds a caller from raw Convex auth claims inside a HOST-APP function so it
 * can be forwarded into a component ACTION, where `ctx.auth` yields nothing
 * (Convex does not propagate user auth into component actions). The result is
 * only as trusted as the app-side `ctx.auth` identity it came from. MCP callers
 * are constructed separately from a verified OAuth access context and never
 * enter Convex user auth.
 */
export function cmsCallerFromActionAuthIdentity(
  identity: {
    subject?: string | null
    name?: string | null
    email?: string | null
    emailVerified?: boolean | null
    token_use?: unknown
  } | null,
): CmsUserCaller | CmsMcpCaller | null {
  if (!identity?.subject) return null
  if (identity.token_use === 'convex-session') {
    return cmsCallerFromConvexAuthIdentity(identity)
  }
  return null
}

export function cmsDeployCaller(deployId: string): CmsDeployCaller {
  return {
    kind: 'deploy',
    deployId,
    subject: subject.deploy(deployId),
  }
}
