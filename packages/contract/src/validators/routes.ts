import { v } from 'convex/values'

import { ginkoRouteClaimValidator, ginkoRouteDiagnosticCodeValidator } from './diagnostics.js'

export const ginkoRouteDiagnosticValidator = v.object({
  code: ginkoRouteDiagnosticCodeValidator,
  message: v.string(),
  href: v.string(),
  claims: v.array(ginkoRouteClaimValidator),
})
