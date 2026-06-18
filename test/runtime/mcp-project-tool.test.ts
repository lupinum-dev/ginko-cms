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
  operationPreviewValidator: () => undefined,
}))

vi.mock('@lupinum/trellis/mcp', () => {
  return {
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
    ).toThrow('[ginko-cms] Destructive MCP tools require a generated operation handle')

    expect(() =>
      projectTool({
        schema,
        operation: 'mutation',
        call: {},
        meta: { name: 'unsafe-delete', destructive: true },
        preview: {},
      }),
    ).toThrow('[ginko-cms] Destructive MCP tools require a generated operation handle')
  })

  it('rejects direct write tools unless they are operation-backed', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    expect(() =>
      projectTool({
        schema,
        call: {},
        meta: { name: 'unsafe-write' },
      }),
    ).toThrow(
      '[ginko-cms] Direct MCP mutation "unsafe-write" must be backed by an explicit operation.',
    )
  })

  it('routes bounded write tools through generated operation handles without previews', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')
    const operation = { args: {}, id: 'save-entry-draft', safety: 'bounded-write' }
    const call = {}

    const tool = projectTool({
      schema,
      operation,
      call,
      meta: { name: 'save-entry-draft' },
    }) as unknown as { operationBackedDestructive: boolean; options: Record<string, unknown> }

    expect(tool.operationBackedDestructive).toBe(true)
    expect(tool.options).not.toHaveProperty('execute')
    expect(tool.options).not.toHaveProperty('preview')
    expect(tool.options).not.toHaveProperty('confirmationMode')
  })

  it('routes destructive tools through generated operation handles', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')
    const operation = { args: {}, id: 'delete-entry' }
    const call = {}
    const preview = {}

    const tool = projectTool({
      schema,
      operation,
      call,
      meta: { name: 'delete-entry', destructive: true },
    }) as unknown as { operationBackedDestructive: boolean; options: Record<string, unknown> }

    expect(tool.operationBackedDestructive).toBe(true)
    expect(tool.options).toMatchObject({
      confirmationMode: 'backend',
    })
    expect(tool.options).not.toHaveProperty('execute')
    expect(tool.options).not.toHaveProperty('preview')
    expect(tool.options).not.toHaveProperty('previewOperation')

    expect(() =>
      projectTool({
        schema,
        operation,
        call,
        preview,
        meta: { name: 'delete-entry', destructive: true },
      }),
    ).toThrow('[ginko-cms] Destructive MCP operation handles do not accept preview refs.')

    const backendTool = projectTool({
      schema,
      operation,
      call,
      confirmationMode: 'backend',
      meta: { name: 'delete-entry', destructive: true },
    }) as unknown as { options: Record<string, unknown> }

    expect(backendTool.options).not.toHaveProperty('execute')
    expect(backendTool.options).not.toHaveProperty('previewOperation')
  })
})
