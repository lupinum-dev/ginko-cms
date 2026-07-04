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
  email?: string
}

export type CmsMcpCaller = {
  kind: 'mcp'
  apiKeyId: string
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
      return subject.agent(caller.apiKeyId)
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
        throw new Error('CMS MCP caller subject must match the apiKeyId.')
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

export function cmsMcpCaller(apiKeyId: string): CmsMcpCaller {
  return {
    kind: 'mcp',
    apiKeyId,
    subject: subject.agent(apiKeyId),
  }
}

export function cmsCallerFromConvexAuthIdentity(identity: {
  subject?: string | null
  email?: string | null
}): CmsUserCaller {
  return cmsUserCaller(identity.subject ?? '', { email: identity.email })
}

export function cmsDeployCaller(deployId: string): CmsDeployCaller {
  return {
    kind: 'deploy',
    deployId,
    subject: subject.deploy(deployId),
  }
}
