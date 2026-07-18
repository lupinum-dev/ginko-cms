import { v } from 'convex/values'

export const cmsAnonymousCallerValidator = v.object({
  kind: v.literal('anonymous'),
  subject: v.literal('system:anonymous'),
})

export const cmsUserCallerValidator = v.object({
  kind: v.literal('user'),
  userId: v.string(),
  subject: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerified: v.optional(v.boolean()),
})

export const cmsMcpCallerValidator = v.object({
  kind: v.literal('mcp'),
  apiKeyId: v.string(),
  subject: v.string(),
})

export const cmsDeployCallerValidator = v.object({
  kind: v.literal('deploy'),
  deployId: v.string(),
  subject: v.string(),
})

export const cmsCallerValidator = v.union(
  cmsAnonymousCallerValidator,
  cmsUserCallerValidator,
  cmsMcpCallerValidator,
  cmsDeployCallerValidator,
)

export const cmsCallerValidators = {
  caller: cmsCallerValidator,
}
