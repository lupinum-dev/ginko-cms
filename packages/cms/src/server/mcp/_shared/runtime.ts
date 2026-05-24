import { cmsAnonymousCaller, cmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'

import {
  defaultCmsMcpCapabilities,
  getCmsMcpCapabilities,
  type CmsAccessContext,
  type CmsMcpCapabilities,
} from './capabilities.js'

type AccessContextQuery = () => Promise<CmsAccessContext | null>

export function getMcpCmsCallerFromAuth(auth?: { mcpKeyId: string } | null): CmsCaller {
  if (!auth) {
    return cmsAnonymousCaller()
  }

  return cmsMcpCaller(auth.mcpKeyId)
}

export async function resolveCmsMcpCapabilitiesForCmsCaller(
  caller: CmsCaller,
  queryAccessContext: AccessContextQuery,
): Promise<CmsMcpCapabilities> {
  if (caller.kind !== 'mcp') {
    return { ...defaultCmsMcpCapabilities }
  }

  return getCmsMcpCapabilities(await queryAccessContext())
}
