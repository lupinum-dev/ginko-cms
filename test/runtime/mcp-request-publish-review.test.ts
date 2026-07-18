import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const refs = {
    getEntry: { _type: 'query', name: 'editor.getEntry' },
    requestPublishReview: { _type: 'mutation', name: 'reviewRequests.requestPublishReview' },
  }
  return {
    refs,
    calls: [] as Array<{ kind: 'query' | 'mutation'; fn: unknown; args: unknown }>,
    reviewMutationError: null as Error | null,
  }
})

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: (definition: unknown) => definition,
}))

vi.mock('#convex/api', () => ({
  api: {
    ginkoCms: {
      editor: {
        getEntry: mocks.refs.getEntry,
      },
      reviewRequests: {
        requestPublishReview: mocks.refs.requestPublishReview,
      },
    },
  },
}))

vi.mock('../../packages/cms/src/server/mcp/_shared/agent-tools.js', () => {
  return {
    asRecord: (value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
        : {},
    fail: (
      message: string,
      details?: unknown,
      options: { category?: string; code?: string } = {},
    ) => ({
      content: [{ type: 'text', text: message }],
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          category: options.category ?? 'validation',
          ...(options.code ? { code: options.code } : {}),
          message,
          ...(details === undefined ? {} : { details }),
        },
      },
    }),
    failFromError: (error: unknown, fallback: string) => ({
      content: [{ type: 'text', text: error instanceof Error ? error.message : fallback }],
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          category: 'validation',
          message: error instanceof Error ? error.message : fallback,
        },
      },
    }),
    ok: (data: unknown, summary: string) => ({
      content: [{ type: 'text', text: summary }],
      structuredContent: data as Record<string, unknown>,
    }),
    loadAgentContext: vi.fn(async () => ({
      capabilities: {},
      caller: { kind: 'mcp', apiKeyId: 'ba_key_1', subject: 'agent:ba_key_1' },
      runtime: {},
      convex: {
        query: async (fn: unknown, args: unknown) => {
          mocks.calls.push({ kind: 'query', fn, args })
          if (fn === mocks.refs.getEntry) {
            return {
              _id: 'entry-1',
              draftVersion: 7,
            }
          }
          return null
        },
        mutation: async (fn: unknown, args: unknown) => {
          mocks.calls.push({ kind: 'mutation', fn, args })
          if (mocks.reviewMutationError) throw mocks.reviewMutationError
          if (fn === mocks.refs.requestPublishReview) {
            return {
              _id: 'review-1',
              status: 'pending',
              operationId: 'ginko-cms.publish-entry',
              entryId: (args as { entryId: unknown }).entryId,
            }
          }
          return null
        },
      },
    })),
  }
})

describe('request-publish-review MCP tool', () => {
  it('[AGT-06] creates a review request from publish diagnostics without changing public output', async () => {
    mocks.calls.length = 0
    mocks.reviewMutationError = null
    const tool = (
      await import('../../packages/cms/src/server/mcp/tools/content/request-publish-review')
    ).default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.structuredContent).toMatchObject({
      publicChanged: false,
      reviewRequest: {
        _id: 'review-1',
        status: 'pending',
        operationId: 'ginko-cms.publish-entry',
      },
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'query',
        fn: mocks.refs.getEntry,
        args: { id: 'entry-1' },
      },
      expect.objectContaining({
        kind: 'mutation',
        fn: mocks.refs.requestPublishReview,
        args: expect.objectContaining({
          agentRunId: 'run-1',
          entryId: 'entry-1',
          locales: ['en'],
          expectedVersion: 7,
        }),
      }),
    ])
    const mutation = mocks.calls.find((call) => call.kind === 'mutation')
    expect(mutation?.args).not.toHaveProperty('preview')
    expect(mutation?.args).not.toHaveProperty('versionHash')
  })

  it('surfaces server-side review preview blockers without trusting local diagnostics', async () => {
    mocks.calls.length = 0
    mocks.reviewMutationError = new Error(
      'Publish review was not created because the requested publish is currently blocked.',
    )
    const tool = (
      await import('../../packages/cms/src/server/mcp/tools/content/request-publish-review')
    ).default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: { error?: { code?: string } }
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBe(true)
    expect(result.structuredContent?.error?.message).toContain('currently blocked')
    expect(mocks.calls.map((call) => call.fn)).toEqual([
      mocks.refs.getEntry,
      mocks.refs.requestPublishReview,
    ])
  })
})
