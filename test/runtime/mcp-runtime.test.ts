import { cmsAnonymousCaller, cmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defaultCmsMcpCapabilities,
  getCmsMcpCapabilities,
} from '#ginko-cms-server/mcp/_shared/capabilities'
import {
  getMcpCmsCallerFromAuth,
  resolveCmsMcpCapabilitiesForCmsCaller,
} from '#ginko-cms-server/mcp/_shared/runtime'

describe('ginko mcp runtime', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('resolves anonymous and MCP callers from request context', async () => {
    expect(getMcpCmsCallerFromAuth(null)).toEqual(cmsAnonymousCaller())
    expect(getMcpCmsCallerFromAuth({ mcpKeyId: 'key_123' })).toEqual(cmsMcpCaller('key_123'))
  })

  it('derives MCP capability visibility from backend permission context', async () => {
    const accessContext = {
      userId: 'owner-1',
      workspaceId: null,
      role: 'owner',
      can: {
        'cms.read': true,
        'cms.bootstrap': false,
        'cms.entries.create': true,
        'cms.entries.edit': true,
        'cms.entries.publish': true,
        'cms.entries.archive': true,
        'cms.entries.delete': true,
        'cms.collections.manage': true,
        'cms.settings.manage': true,
        'cms.members.manage': true,
        'cms.assets.manage': true,
      },
      member: null,
      canBootstrap: false,
    }

    await expect(
      resolveCmsMcpCapabilitiesForCmsCaller(cmsMcpCaller('key_123'), async () => accessContext),
    ).resolves.toEqual({
      readCms: true,
      createEntries: true,
      editEntries: true,
      publishEntries: true,
      archiveEntries: true,
      deleteEntries: true,
      manageCollections: true,
      manageMembers: true,
      manageSettings: true,
      manageAssets: true,
    })
  })

  it('keeps anonymous MCP callers on the empty capability snapshot', async () => {
    expect(getCmsMcpCapabilities(null)).toEqual({ ...defaultCmsMcpCapabilities })

    await expect(
      resolveCmsMcpCapabilitiesForCmsCaller(cmsAnonymousCaller(), async () => {
        throw new Error('should not query permissions for anonymous caller')
      }),
    ).resolves.toEqual({ ...defaultCmsMcpCapabilities })
  })
})
