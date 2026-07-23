import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, ref, toValue } from 'vue'

import { useStudioSettingsAdmin } from '../../packages/cms/studio-app/src/composables/internal/useStudioSettingsAdmin'

const mocks = vi.hoisted(() => ({
  mcpEnabled: false,
  queries: [] as unknown[],
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({ mcp: { enabled: mocks.mcpEnabled } }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    createEntries: 'entries.create',
    editEntries: 'entries.edit',
    manageMembers: 'members.manage',
    manageSettings: 'settings.manage',
    read: 'cms.read',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: (_query: never, args: unknown) => {
    mocks.queries.push(args)
    return {
      data: ref(null),
      error: ref(null),
      pending: ref(false),
      refresh: vi.fn(async () => undefined),
    }
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexAction: () => vi.fn(),
  useConvexMutation: () => vi.fn(),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsAuthState', () => ({
  useCmsAuthState: () => ({ user: ref(null) }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsContractCompatibility', () => ({
  useCmsContractCompatibility: () => ({
    compatibility: ref(null),
    query: { pending: ref(false) },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    currentLocale: ref('en'),
    t: (key: string) => key,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    can: () => computed(() => true),
  }),
}))

describe('disabled Studio MCP settings', () => {
  beforeEach(() => {
    mocks.queries.length = 0
    mocks.mcpEnabled = false
  })

  it('skips credential reads and rejects credential changes when MCP is disabled', async () => {
    const scope = effectScope()
    const admin = scope.run(() => useStudioSettingsAdmin())!
    const credentialQueryArgs = mocks.queries.at(-1)

    expect(mocks.queries).toHaveLength(8)
    expect(toValue(credentialQueryArgs)).toBeNull()
    await admin.handleCreateMcpConnection()
    expect(admin.mcpConnectionError.value).toBe('MCP is disabled for this application.')
    await admin.handleRevokeMcpConnection('credential-id')
    expect(admin.mcpConnectionError.value).toBe('MCP is disabled for this application.')
    scope.stop()
  })
})
