import { anyApi, getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import type { GinkoCmsInstalledContractStatus } from '../../packages/cms/src/public/contract-compatibility'
import { createContractGuardedMcpCaller } from '../../packages/cms/src/server/mcp/_shared/agent-tools'
import type { McpConvexCaller } from '../../packages/cms/src/server/mcp/_shared/auth'

const expected = {
  expectedContentHash: 'a'.repeat(64),
  expectedPresentationHash: 'b'.repeat(64),
}
const ready: GinkoCmsInstalledContractStatus = {
  installedContentHash: expected.expectedContentHash,
  installedPresentationHash: expected.expectedPresentationHash,
  transitionState: 'ready',
  transitionRunId: null,
}

function fixture(status: GinkoCmsInstalledContractStatus) {
  const raw = {
    query: vi.fn(async (reference: unknown) =>
      getFunctionName(reference as never).endsWith('getInstalledContractStatus')
        ? status
        : { id: 'read-result' },
    ),
    mutation: vi.fn(async () => ({ id: 'mutation-result' })),
    action: vi.fn(async () => ({ id: 'action-result' })),
  } as unknown as McpConvexCaller
  const getExpected = vi.fn(() => expected)
  return {
    raw,
    getExpected,
    guarded: createContractGuardedMcpCaller(raw, getExpected),
  }
}

describe('MCP host contract write gate', () => {
  it('allows reads without requiring contract compatibility', async () => {
    const { guarded, getExpected } = fixture({
      ...ready,
      installedContentHash: 'c'.repeat(64),
    })

    await expect(
      guarded.query(anyApi.ginkoCms.editor.getEntry, { id: 'entry-1' }),
    ).resolves.toEqual({ id: 'read-result' })
    expect(getExpected).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'missing contract',
      status: {
        installedContentHash: null,
        installedPresentationHash: null,
        transitionState: null,
        transitionRunId: null,
      } satisfies GinkoCmsInstalledContractStatus,
      blocker: 'contract_missing',
    },
    {
      label: 'content mismatch',
      status: { ...ready, installedContentHash: 'c'.repeat(64) },
      blocker: 'content_mismatch',
    },
    {
      label: 'presentation mismatch',
      status: { ...ready, installedPresentationHash: 'c'.repeat(64) },
      blocker: 'presentation_mismatch',
    },
  ])('refuses MCP mutations for $label before dispatch', async ({ status, blocker }) => {
    const { guarded, raw } = fixture(status)

    await expect(
      guarded.mutation(anyApi.ginkoCms.editor.mcpSaveEntryDraft, {}),
    ).rejects.toMatchObject({
      code: 'CMS_CONTRACT_WRITE_BLOCKED',
      category: 'conflict',
      details: { blockers: expect.arrayContaining([blocker]) },
    })
    expect(raw.mutation).not.toHaveBeenCalled()
  })

  it('allows MCP mutations and actions only when the installed pair is ready', async () => {
    const { guarded, raw } = fixture(ready)

    await expect(guarded.mutation(anyApi.ginkoCms.editor.mcpSaveEntryDraft, {})).resolves.toEqual({
      id: 'mutation-result',
    })
    await expect(
      guarded.action(anyApi.ginkoCms.assets.finalizeAssetUploadSession, {}),
    ).resolves.toEqual({ id: 'action-result' })
    expect(raw.mutation).toHaveBeenCalledTimes(1)
    expect(raw.action).toHaveBeenCalledTimes(1)
  })
})
