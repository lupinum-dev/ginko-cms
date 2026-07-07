import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const refs = {
    getEntry: { _type: 'query', name: 'editor.getEntry' },
    getEntryReadinessDetail: { _type: 'query', name: 'editor.getEntryReadinessDetail' },
    previewArchiveEntryOperation: {
      _type: 'mutation',
      name: 'editor.previewArchiveEntryOperation',
    },
    archiveEntryOperationExecute: {
      _type: 'mutation',
      name: 'editor.archiveEntryOperationExecute',
    },
    previewPublishEntryOperation: {
      _type: 'mutation',
      name: 'editor.previewPublishEntryOperation',
    },
    publishEntryOperationExecute: {
      _type: 'mutation',
      name: 'editor.publishEntryOperationExecute',
    },
    mcpPreviewArchiveEntryOperation: {
      _type: 'mutation',
      name: 'editor.mcpPreviewArchiveEntryOperation',
    },
    mcpArchiveEntry: {
      _type: 'mutation',
      name: 'editor.mcpArchiveEntry',
    },
    mcpPreviewPublishEntryOperation: {
      _type: 'mutation',
      name: 'editor.mcpPreviewPublishEntryOperation',
    },
    mcpPublishEntry: {
      _type: 'mutation',
      name: 'editor.mcpPublishEntry',
    },
    mcpRestoreEntry: { _type: 'mutation', name: 'editor.mcpRestoreEntry' },
  }
  return {
    refs,
    calls: [] as Array<{ kind: 'query' | 'mutation'; fn: unknown; args: unknown }>,
    draftVersion: 7,
    publishStatus: 'ready',
    publishCapability: true,
    archiveCapability: true,
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
        getEntryReadinessDetail: mocks.refs.getEntryReadinessDetail,
        archiveEntryOperationExecute: mocks.refs.archiveEntryOperationExecute,
        mcpArchiveEntry: mocks.refs.mcpArchiveEntry,
        mcpPreviewArchiveEntryOperation: mocks.refs.mcpPreviewArchiveEntryOperation,
        mcpPreviewPublishEntryOperation: mocks.refs.mcpPreviewPublishEntryOperation,
        mcpPublishEntry: mocks.refs.mcpPublishEntry,
        mcpRestoreEntry: mocks.refs.mcpRestoreEntry,
        previewArchiveEntryOperation: mocks.refs.previewArchiveEntryOperation,
        previewPublishEntryOperation: mocks.refs.previewPublishEntryOperation,
        publishEntryOperationExecute: mocks.refs.publishEntryOperationExecute,
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
    loadAgentContext: vi.fn(async (_event: unknown, capability?: string) => {
      if (capability === 'publishEntries' && !mocks.publishCapability) {
        throw new Error('Caller does not have the publishEntries capability.')
      }
      if (capability === 'archiveEntries' && !mocks.archiveCapability) {
        throw new Error('Caller does not have the archiveEntries capability.')
      }
      return {
        capabilities: {
          archiveEntries: mocks.archiveCapability,
          publishEntries: mocks.publishCapability,
          readCms: true,
        },
        caller: { kind: 'mcp', apiKeyId: 'ba_key_1', subject: 'agent:ba_key_1' },
        runtime: {},
        convex: {
          query: async (fn: unknown, args: unknown) => {
            mocks.calls.push({ kind: 'query', fn, args })
            if (fn === mocks.refs.getEntry) {
              return {
                _id: 'entry-1',
                draftVersion: mocks.draftVersion,
              }
            }
            if (fn === mocks.refs.getEntryReadinessDetail) {
              return {
                entryId: 'entry-1',
                locales: [{ locale: 'en', state: 'ready' }],
              }
            }
            return null
          },
          mutation: async (fn: unknown, args: unknown) => {
            mocks.calls.push({ kind: 'mutation', fn, args })
            if (
              fn === mocks.refs.previewArchiveEntryOperation ||
              fn === mocks.refs.mcpPreviewArchiveEntryOperation
            ) {
              return {
                allowed: true,
                summary: 'Will archive entry.',
                blockers: [],
                warnings: [],
                confirmation: { token: 'archive-confirm-token', expiresAt: Date.now() + 60_000 },
              }
            }
            if (
              fn === mocks.refs.archiveEntryOperationExecute ||
              fn === mocks.refs.mcpArchiveEntry
            ) {
              return null
            }
            if (fn === mocks.refs.mcpRestoreEntry) {
              return null
            }
            if (
              fn === mocks.refs.previewPublishEntryOperation ||
              fn === mocks.refs.mcpPreviewPublishEntryOperation
            ) {
              const blocked = mocks.publishStatus !== 'ready'
              return {
                allowed: !blocked,
                summary: blocked ? 'Publish is blocked.' : 'Ready to publish.',
                blockers: blocked
                  ? [{ code: 'missing_required_field', message: 'Title is required.' }]
                  : [],
                warnings: [],
                effects: [{ kind: 'changes', count: 1 }],
                details: {
                  locales: [{ locale: 'en', status: mocks.publishStatus }],
                  changes: [{ kind: 'data', locale: 'en' }],
                  events: [{ type: 'content.publish' }],
                },
                confirm: blocked ? null : { operationId: 'ginko-cms.publish-entry', args },
                confirmation: blocked
                  ? null
                  : { token: 'confirm-token-1', expiresAt: Date.now() + 60_000 },
                version: { draftVersion: mocks.draftVersion },
              }
            }
            if (
              fn === mocks.refs.publishEntryOperationExecute ||
              fn === mocks.refs.mcpPublishEntry
            ) {
              return {
                versionId: 'revision-1',
                dirtyLocales: [],
                draftVersion: mocks.draftVersion,
              }
            }
            return null
          },
        },
      }
    }),
  }
})

describe('preview-publish MCP tool', () => {
  it('returns canonical publish operation preview without changing public output', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 7
    mocks.publishStatus = 'ready'
    mocks.publishCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/preview-publish'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.structuredContent).toMatchObject({
      publicChanged: false,
      preview: {
        allowed: true,
        summary: 'Ready to publish.',
        confirmation: { token: 'confirm-token-1' },
      },
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'mutation',
        fn: mocks.refs.mcpPreviewPublishEntryOperation,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
          locales: ['en'],
          expectedVersion: 7,
        },
      },
    ])
  })

  it('returns blocked diagnostics as preview data without creating side effects', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 7
    mocks.publishStatus = 'blocked'
    mocks.publishCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/preview-publish'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toMatchObject({
      publicChanged: false,
      preview: {
        allowed: false,
        blockers: [{ code: 'missing_required_field' }],
      },
    })
    expect(mocks.calls.map((call) => call.fn)).toEqual([mocks.refs.mcpPreviewPublishEntryOperation])
  })

  it('delegates stale draft checks to the canonical MCP publish preview operation', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 8
    mocks.publishStatus = 'ready'
    mocks.publishCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/preview-publish'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        collection: 'pages',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBeUndefined()
    expect(mocks.calls).toEqual([
      {
        kind: 'mutation',
        fn: mocks.refs.mcpPreviewPublishEntryOperation,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
          locales: ['en'],
          expectedVersion: 7,
        },
      },
    ])
  })

  it('fails closed before preview when the agent lacks publish capability', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 7
    mocks.publishStatus = 'ready'
    mocks.publishCapability = false
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/preview-publish'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: { error?: { message?: string } }
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBe(true)
    expect(result.structuredContent?.error?.message).toMatch(/publishEntries capability/i)
    expect(mocks.calls).toEqual([])
    mocks.publishCapability = true
  })
})

describe('publish-entry MCP tool', () => {
  it('executes publish through the canonical preview and confirmation operation path', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 7
    mocks.publishStatus = 'ready'
    mocks.publishCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/publish-entry'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
        message: 'Ship it',
      },
      { event: { context: {} } },
    )

    expect(result.structuredContent).toMatchObject({
      publicChanged: true,
      publish: {
        versionId: 'revision-1',
        dirtyLocales: [],
      },
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'mutation',
        fn: mocks.refs.mcpPreviewPublishEntryOperation,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
          locales: ['en'],
          expectedVersion: 7,
          message: 'Ship it',
        },
      },
      {
        kind: 'mutation',
        fn: mocks.refs.mcpPublishEntry,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
          locales: ['en'],
          expectedVersion: 7,
          message: 'Ship it',
          _confirmationToken: 'confirm-token-1',
        },
      },
    ])
  })

  it('fails closed before preview when the agent lacks publish capability', async () => {
    mocks.calls.length = 0
    mocks.draftVersion = 7
    mocks.publishStatus = 'ready'
    mocks.publishCapability = false
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/publish-entry'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: { error?: { message?: string } }
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
        locales: ['en'],
        expectedVersion: 7,
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBe(true)
    expect(result.structuredContent?.error?.message).toMatch(/publishEntries capability/i)
    expect(mocks.calls).toEqual([])
  })
})

describe('readiness and archive MCP tools', () => {
  it('loads exact readiness detail through the read-only Convex query', async () => {
    mocks.calls.length = 0
    const tool = (
      await import('../../packages/cms/src/server/mcp/tools/content/get-readiness-detail')
    ).default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler({ entryId: 'entry-1' }, { event: { context: {} } })

    expect(result.structuredContent).toMatchObject({
      readiness: {
        entryId: 'entry-1',
        locales: [{ locale: 'en', state: 'ready' }],
      },
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'query',
        fn: mocks.refs.getEntryReadinessDetail,
        args: { entryId: 'entry-1' },
      },
    ])
  })

  it('archives through the MCP preview and canonical confirmation execution', async () => {
    mocks.calls.length = 0
    mocks.archiveCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/archive-entry'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
      },
      { event: { context: {} } },
    )

    expect(result.structuredContent).toMatchObject({
      publicChanged: true,
      preview: { allowed: true },
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'mutation',
        fn: mocks.refs.mcpPreviewArchiveEntryOperation,
        args: { agentRunId: 'agent-run-1', entryId: 'entry-1' },
      },
      {
        kind: 'mutation',
        fn: mocks.refs.mcpArchiveEntry,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
          _confirmationToken: 'archive-confirm-token',
        },
      },
    ])
  })

  it('fails archive before mutation when the agent lacks archive capability', async () => {
    mocks.calls.length = 0
    mocks.archiveCapability = false
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/archive-entry'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        isError?: boolean
        structuredContent?: { error?: { message?: string } }
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
      },
      { event: { context: {} } },
    )

    expect(result.isError).toBe(true)
    expect(result.structuredContent?.error?.message).toMatch(/archiveEntries capability/i)
    expect(mocks.calls).toEqual([])
    mocks.archiveCapability = true
  })

  it('restores through the guarded MCP restore operation', async () => {
    mocks.calls.length = 0
    mocks.archiveCapability = true
    const tool = (await import('../../packages/cms/src/server/mcp/tools/content/restore-entry'))
      .default as {
      handler: (
        args: unknown,
        ctx: { event: unknown },
      ) => Promise<{
        structuredContent?: Record<string, unknown>
      }>
    }

    const result = await tool.handler(
      {
        agentRunId: 'agent-run-1',
        entryId: 'entry-1',
      },
      { event: { context: {} } },
    )

    expect(result.structuredContent).toMatchObject({
      restored: true,
      entryId: 'entry-1',
    })
    expect(mocks.calls).toEqual([
      {
        kind: 'mutation',
        fn: mocks.refs.mcpRestoreEntry,
        args: {
          agentRunId: 'agent-run-1',
          entryId: 'entry-1',
        },
      },
    ])
  })
})
