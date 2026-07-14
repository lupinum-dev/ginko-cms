import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ref: { _type: 'mutation', name: 'editor.mcpPreviewPublishEntry' },
  calls: [] as Array<{ fn: unknown; args: unknown }>,
}))

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: (definition: unknown) => definition,
}))

vi.mock('#convex/api', () => ({
  api: { ginkoCms: { editor: { mcpPreviewPublishEntry: mocks.ref } } },
}))

vi.mock('../../packages/cms/src/server/mcp/_shared/agent-tools.js', () => ({
  failFromError: (error: unknown, fallback: string) => ({
    isError: true,
    structuredContent: { error: error instanceof Error ? error.message : fallback },
  }),
  ok: (data: unknown, summary: string) => ({ structuredContent: data, summary }),
  loadAgentContext: vi.fn(async (_event: unknown, capability: string) => {
    expect(capability).toBe('editEntries')
    return {
      convex: {
        mutation: async (fn: unknown, args: unknown) => {
          mocks.calls.push({ fn, args })
          return { allowed: true, confirm: null, confirmation: null }
        },
      },
    }
  }),
}))

describe('preview-publish MCP tool', () => {
  it('uses only the review-gated preview mutation', async () => {
    mocks.calls.length = 0
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/preview-publish'))
      .default as {
      handler: (args: unknown, ctx: { event: unknown }) => Promise<{ structuredContent: unknown }>
    }
    const args = {
      agentRunId: 'run-1',
      entryId: 'entry-1',
      locales: ['en'],
      expectedVersion: 7,
    }

    await expect(tool.handler(args, { event: {} })).resolves.toMatchObject({
      structuredContent: {
        preview: { allowed: true, confirm: null, confirmation: null },
        publicChanged: false,
      },
    })
    expect(mocks.calls).toEqual([{ fn: mocks.ref, args }])
  })
})
