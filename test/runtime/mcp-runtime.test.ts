import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  cmsCallerFromConvexAuthIdentity,
  cmsMcpCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
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
    expect(getMcpCmsCallerFromAuth({ apiKeyId: 'key_123' })).toEqual(cmsMcpCaller('key_123'))
  })

  it('does not derive MCP callers from Convex issuer fields', () => {
    expect(
      cmsCallerFromConvexAuthIdentity({
        subject: 'key_123',
      }).kind,
    ).toBe('user')

    expect(() =>
      assertCmsCallerConsistency({
        ...cmsMcpCaller('key_123'),
        subject: 'agent:agent:key_123',
      }),
    ).toThrow('CMS MCP caller subject must match the apiKeyId.')
  })

  it('derives MCP capability visibility from backend permission context', async () => {
    const accessContext = {
      userId: 'owner-1',
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
