import { studioSettingsValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'

import { canRead } from './auth/checks.js'
import { callerQuery } from './functions.js'
import { getCmsSettings } from './lib/locale.js'

export const getStudioSettings = callerQuery.protected({
  id: 'settings:getStudioSettings',
  args: {},
  guard: canRead,
  returns: studioSettingsValidator,
  handler: async (ctx) => {
    const settings = await getCmsSettings(ctx)
    if (!settings) return null
    return {
      locales: settings.locales ?? [],
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy ?? null,
      installedContentHash: settings.installedContentHash,
      installedPresentationHash: settings.installedPresentationHash,
      transitionState: settings.transitionState,
      transitionRunId: settings.transitionRunId,
    }
  },
})
