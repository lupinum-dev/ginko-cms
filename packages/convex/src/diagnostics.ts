import { explainPublicVisibility as explainPublicVisibilityArgs } from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'
import { ginkoPublicVisibilityExplanationValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'

import { canRead } from './auth/checks.js'
import { explainPublicVisibilityForEntry } from './diagnostics/visibility.js'
import { callerQuery } from './functions.js'

export { previewPublishImpactForEntry } from './diagnostics/publishImpact.js'

export const explainPublicVisibility = callerQuery.protected({
  id: 'diagnostics:explainPublicVisibility',
  args: explainPublicVisibilityArgs.args,
  guard: canRead,
  returns: ginkoPublicVisibilityExplanationValidator,
  handler: async (ctx, args) => await explainPublicVisibilityForEntry(ctx, args),
})
