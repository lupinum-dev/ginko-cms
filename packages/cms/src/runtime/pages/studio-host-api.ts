import { studioApiSurface } from '#ginko-cms-public/studio-api-surface.js'
import type { GinkoCmsStudioHostApi } from '#ginko-cms-public/types.js'

// Build the Studio host API as a real allowlist (vNext §10.7): pick only the
// references named in `studioApiSurface` out of the generated `#convex/api`,
// and throw if any is missing. The whole source `api` object is never handed to
// the SPA, so a backend function absent from the descriptor cannot cross the
// bridge even though it exists on `#convex/api`.
//
// Extracted from `studio-host.vue` into a standalone module so the allowlist
// projection is directly unit-testable without mounting the Vue component
// (vNext §10 "Ginko tests": "Studio bridge test proving no ... unlisted API
// functions cross the bridge").
export function buildStudioHostApi(source: unknown): GinkoCmsStudioHostApi {
  const apiRoot = requireRecord(source, 'api')
  const cmsRoot = requireRecord(apiRoot.ginkoCms, 'api.ginkoCms')
  const picked: Record<string, Record<string, unknown>> = {}

  for (const [groupName, functions] of Object.entries(studioApiSurface)) {
    const sourceGroup = requireRecord(cmsRoot[groupName], `api.ginkoCms.${groupName}`)
    const pickedGroup: Record<string, unknown> = {}
    for (const functionName of Object.keys(functions)) {
      const reference = sourceGroup[functionName]
      if (!reference) {
        throw new TypeError(
          `[ginko-cms] Studio API is missing api.ginkoCms.${groupName}.${functionName}.`,
        )
      }
      pickedGroup[functionName] = reference
    }
    picked[groupName] = pickedGroup
  }

  return { ginkoCms: picked } as GinkoCmsStudioHostApi
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  throw new TypeError(`[ginko-cms] Studio host bridge is missing ${label}.`)
}
