import { getAuthConfigProvider, type AuthConfig } from '@lupinum/ginko-cms/convex/auth-config'

export default {
  providers: [getAuthConfigProvider()]
} satisfies AuthConfig
