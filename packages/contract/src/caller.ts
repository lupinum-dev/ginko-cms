const subject = {
  user: (value: string): `user:${string}` => `user:${value.trim()}`,
  agent: (value: string): `agent:${string}` => `agent:${value.trim()}`,
  deploy: (value: string): `service:${string}` => `service:deploy:${value.trim()}`,
  anonymous: (): 'system:anonymous' => 'system:anonymous',
} as const

export const cmsMcpConvexAuthIssuer = 'ginko-cms-mcp'

declare const process:
  | {
      env?: Record<string, string | undefined>
    }
  | undefined

export const cmsComponentForwardingKeyEnvNames = [
  'CONVEX_IDENTITY_FORWARDING_KEY',
  'GINKO_CMS_COMPONENT_FORWARDING_KEY',
] as const

type CmsForwardingKeyEnv = Partial<
  Record<(typeof cmsComponentForwardingKeyEnvNames)[number] | 'VITEST', string>
>

function readProcessEnv(): CmsForwardingKeyEnv {
  if (typeof process === 'undefined') return {}
  const env = process.env ?? {}

  return {
    CONVEX_IDENTITY_FORWARDING_KEY: env.CONVEX_IDENTITY_FORWARDING_KEY,
    GINKO_CMS_COMPONENT_FORWARDING_KEY: env.GINKO_CMS_COMPONENT_FORWARDING_KEY,
    VITEST: env.VITEST,
  }
}

export function getCmsComponentForwardingKey(env: CmsForwardingKeyEnv = readProcessEnv()): string {
  for (const name of cmsComponentForwardingKeyEnvNames) {
    const value = env[name]?.trim()
    if (value) return value
  }

  if (env.VITEST) return 'test-ginko-cms-component-forwarding-key'

  throw new Error(
    `Ginko CMS component forwarding requires ${cmsComponentForwardingKeyEnvNames.join(' or ')}.`,
  )
}

export type CmsAnonymousCaller = {
  kind: 'anonymous'
  subject: 'system:anonymous'
}

export type CmsUserCaller = {
  kind: 'user'
  userId: string
  subject: `user:${string}`
  email?: string
}

export type CmsMcpCaller = {
  kind: 'mcp'
  mcpKeyId: string
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
      return subject.agent(caller.mcpKeyId)
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
        throw new Error('CMS MCP caller subject must match the mcpKeyId.')
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
    email?: string | null
  },
): CmsUserCaller {
  return {
    kind: 'user',
    userId,
    subject: subject.user(userId),
    ...(profile?.email ? { email: profile.email } : {}),
  }
}

export function cmsMcpCaller(mcpKeyId: string): CmsMcpCaller {
  return {
    kind: 'mcp',
    mcpKeyId,
    subject: subject.agent(mcpKeyId),
  }
}

export function cmsCallerFromConvexAuthIdentity(identity: {
  subject?: string | null
  issuer?: string | null
  email?: string | null
}): CmsUserCaller | CmsMcpCaller {
  if (identity.issuer === cmsMcpConvexAuthIssuer) {
    return cmsMcpCaller(identity.subject ?? '')
  }

  return cmsUserCaller(identity.subject ?? '', { email: identity.email })
}

export function cmsDeployCaller(deployId: string): CmsDeployCaller {
  return {
    kind: 'deploy',
    deployId,
    subject: subject.deploy(deployId),
  }
}
