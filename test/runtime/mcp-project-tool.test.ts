import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const refs = {
    accessContext: { _type: 'query', name: 'members.getAccessContext' },
    query: { _type: 'query', name: 'editor.getEntry' },
    execute: { _type: 'mutation', name: 'editor.deleteEntryOperationExecute' },
    preview: { _type: 'mutation', name: 'editor.previewDeleteEntryOperation' },
  }
  return {
    refs,
    calls: [] as Array<{ kind: string; fn: unknown; args: unknown; identity: unknown }>,
  }
})

vi.mock('#convex/api', () => ({
  components: {
    ginkoCms: {
      members: {
        getAccessContext: mocks.refs.accessContext,
      },
    },
  },
}))

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({
  defineMcpTool: (definition: unknown) => definition,
}))

vi.mock('../../packages/cms/src/server/mcp/_shared/auth.js', () => ({
  getMcpAuth: () => ({ mcpKeyId: 'mcp-key-1' }),
  requireMcpAuth: () => ({ mcpKeyId: 'mcp-key-1' }),
}))

vi.mock('../../packages/cms/src/server/mcp/_shared/convex-caller.js', () => ({
  createAdminConvexCaller: (_event?: unknown, identity?: unknown) => ({
    query: async (fn: unknown, args: unknown) => {
      mocks.calls.push({ kind: 'query', fn, args, identity })
      return {
        can: {
          'cms.read': true,
          'cms.entries.create': true,
          'cms.entries.edit': true,
          'cms.entries.publish': true,
          'cms.entries.archive': true,
          'cms.entries.delete': true,
          'cms.collections.manage': true,
          'cms.members.manage': true,
          'cms.settings.manage': true,
          'cms.assets.manage': true,
        },
        canBootstrap: false,
        member: { id: 'member-1' },
      }
    },
    mutation: async (fn: unknown, args: unknown) => {
      mocks.calls.push({ kind: 'mutation', fn, args, identity })
      if (fn === mocks.refs.preview) {
        return {
          allowed: true,
          summary: 'Preview ok.',
          confirmation: { token: 'confirm-1' },
        }
      }
      return { deleted: true }
    },
    action: async (fn: unknown, args: unknown) => {
      mocks.calls.push({ kind: 'action', fn, args, identity })
      return { ok: true }
    },
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
  it('rejects destructive tools that do not name preview and execute refs', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    expect(() =>
      projectTool({
        schema,
        operation: 'mutation',
        meta: { name: 'unsafe-delete', destructive: true },
      }),
    ).toThrow('needs explicit preview and execute refs')

    expect(() =>
      projectTool({
        schema,
        operation: {
          execute: mocks.refs.execute as never,
        },
        meta: { name: 'unsafe-delete', destructive: true },
      }),
    ).toThrow('needs explicit preview and execute refs')
  })

  it('rejects direct write tools unless they are operation-backed', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    const tool = projectTool({
      schema,
      call: mocks.refs.execute as never,
      operation: 'mutation',
      meta: { name: 'unsafe-write' },
    })

    await expect(tool.handler({} as never, { event: { context: {} } } as never)).rejects.toThrow(
      '[ginko-cms] Direct MCP mutation "unsafe-write" must be backed by an explicit operation.',
    )
  })

  it('routes bounded write tools through explicit execute refs', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    const tool = projectTool({
      schema,
      operation: {
        execute: mocks.refs.execute as never,
      },
      meta: { name: 'save-entry-draft' },
    })

    const result = await tool.handler(
      { title: 'Draft' } as never,
      {
        event: { context: {} },
      } as never,
    )

    expect(result.structuredContent).toEqual({ deleted: true })
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        kind: 'mutation',
        fn: mocks.refs.execute,
        args: { title: 'Draft' },
        identity: {
          issuer: 'ginko-cms-mcp',
          subject: 'mcp-key-1',
        },
      }),
    )
  })

  it('previews destructive tools before executing with a confirmation token', async () => {
    const { projectTool } =
      await import('../../packages/cms/src/server/mcp/_shared/project-tool-runtime')

    const tool = projectTool({
      schema,
      operation: {
        execute: mocks.refs.execute as never,
        preview: mocks.refs.preview as never,
      },
      meta: { name: 'delete-entry', destructive: true },
    })

    const preview = await tool.handler(
      { entryId: 'entry-1' } as never,
      {
        event: { context: {} },
      } as never,
    )
    expect(preview.isError).toBe(true)
    expect(preview.structuredContent).toMatchObject({
      ok: false,
      error: {
        category: 'confirmation_required',
        code: 'CMS_CONFIRMATION_REQUIRED',
      },
    })
    expect(preview.structuredContent?.error).toMatchObject({
      details: {
        preview: {
          confirmation: { token: 'confirm-1' },
        },
      },
    })

    const executed = await tool.handler(
      { entryId: 'entry-1', _confirmationToken: 'confirm-1' } as never,
      { event: { context: {} } } as never,
    )
    expect(executed.structuredContent).toEqual({ deleted: true })
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        kind: 'mutation',
        fn: mocks.refs.execute,
        args: { entryId: 'entry-1', _confirmationToken: 'confirm-1' },
      }),
    )
  })
})
