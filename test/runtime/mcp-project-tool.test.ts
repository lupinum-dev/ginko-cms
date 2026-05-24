import { describe, expect, it, vi } from 'vitest'

vi.mock('@lupinum/trellis/server', () => ({
  createServerConvexCaller: () => ({
    query: async () => undefined,
    mutation: async () => undefined,
    action: async () => undefined,
  }),
}))

vi.mock('@lupinum/trellis/backend', () => ({
  createIdentityForwardingEnvelopeArgs: () => ({ _trellisForwarding: 'signed' }),
  executeOperationRef: (operation: unknown, call: unknown) => ({
    kind: 'execute',
    call,
    operation,
  }),
  operationPreviewValidator: () => undefined,
  previewOperationRef: (operation: unknown, preview: unknown) => ({
    kind: 'preview',
    operation,
    preview,
  }),
  transportExecuteOperationRef: (operation: unknown, call: unknown) => ({
    kind: 'transport-execute',
    call,
    operation,
  }),
}))

vi.mock('@lupinum/trellis/mcp', () => {
  return {
    stampMcpToolSafety: (value: unknown) => value,
    defineMcpApp: () => ({
      tool: {
        operation: (_operation: unknown, options: Record<string, unknown>) => ({
          name: 'operation-tool',
          operationBackedDestructive: true,
          options,
        }),
        query: (options: Record<string, unknown>) => ({
          name: options.meta && (options.meta as { name?: string }).name,
          operation: 'query',
          options,
        }),
        mutation: (options: Record<string, unknown>) => ({
          name: options.meta && (options.meta as { name?: string }).name,
          operation: 'mutation',
          options,
        }),
      },
    }),
  }
})

vi.mock('../../packages/cms/src/server/mcp/_shared/auth.js', () => ({
  getMcpAuth: () => null,
  requireMcpAuth: () => {
    throw new Error('not authenticated')
  },
}))

vi.mock('../../packages/cms/src/server/mcp/_shared/convex-caller.js', () => ({
  createAdminConvexCaller: () => ({
    mutation: async () => 'redeemed',
  }),
}))

const schema = {
  description: 'Test tool.',
  args: {},
  meta: {
    fields: {},
  },
}

describe('projectTool MCP safety', () => {
  it('rejects destructive tools that are not backed by a previewable operation', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    expect(() =>
      projectTool({
        schema,
        operation: 'mutation',
        call: {},
        meta: { name: 'unsafe-delete', destructive: true },
      }),
    ).toThrow('[ginko-cms] Destructive MCP tools require a Convex preview ref')

    expect(() =>
      projectTool({
        schema,
        operation: 'mutation',
        call: {},
        meta: { name: 'unsafe-delete', destructive: true },
        preview: {},
      }),
    ).toThrow('[ginko-cms] Destructive MCP tools require an explicit operation')
  })

  it('rejects direct write tools unless they declare bounded-write safety', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    expect(() =>
      projectTool({
        schema,
        call: {},
        meta: { name: 'unsafe-write' },
      }),
    ).toThrow('[ginko-cms] Direct MCP mutation "unsafe-write" requires bounded-write safety.')
  })

  it('routes destructive tools through operation preview and execute refs', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')
    const operation = { args: {}, id: 'delete-entry' }
    const call = {}
    const preview = {}

    const tool = projectTool({
      schema,
      operation,
      call,
      preview,
      meta: { name: 'delete-entry', destructive: true },
    }) as unknown as { operationBackedDestructive: boolean; options: Record<string, unknown> }

    expect(tool.operationBackedDestructive).toBe(true)
    expect(tool.options).toMatchObject({
      confirmationMode: 'backend',
      execute: { kind: 'execute', operation, call },
      preview: { kind: 'preview', operation, preview },
      previewOperation: 'mutation',
    })

    const backendTool = projectTool({
      schema,
      operation,
      call,
      preview,
      confirmationMode: 'backend',
      meta: { name: 'delete-entry', destructive: true },
    }) as unknown as { options: Record<string, unknown> }

    expect(backendTool.options.execute).toMatchObject({
      kind: 'execute',
      operation,
      call,
    })
    expect(backendTool.options.previewOperation).toBe('mutation')
  })
})
