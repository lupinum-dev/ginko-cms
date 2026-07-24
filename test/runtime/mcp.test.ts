import { getFunctionAddress } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createGinkoMcpHandler } from '../../playground/convex/ginkoCms/mcp'

const resource = new URL('https://ginko.example.test/mcp')
const application = new URL('https://app.example.test')
const bearer = 'ginko-mcp-bearer-sentinel'

function functionName(reference: unknown) {
  const address = getFunctionAddress(reference as never)
  return 'name' in address ? address.name : address.reference
}

function createFixture() {
  let credentialActive = true
  let applicationAccess: 'allowed' | 'revoked-member' | 'cross-tenant' = 'allowed'
  let scopes = ['readCms', 'editEntries']
  let draftVersion = 1
  let review: Record<string, unknown> | null = null
  const calls: Array<{ functionName: unknown; args: unknown }> = []
  const ctx = {
    meta: {
      async getRequestMetadata() {
        return { ip: '203.0.113.10', requestId: crypto.randomUUID() }
      },
    },
    async runQuery(reference: unknown, args: unknown) {
      const name = functionName(reference)
      calls.push({ functionName: name, args })
      if (name === 'ginkoCms/mcpOperations:getEntry') {
        if (applicationAccess !== 'allowed') {
          throw new Error(`private application denial: ${applicationAccess}`)
        }
        return { _id: 'entry-1', draftVersion }
      }
      if (name === 'ginkoCms/mcpOperations:getReviewStatus') {
        if (applicationAccess !== 'allowed') {
          throw new Error(`private application denial: ${applicationAccess}`)
        }
        if (!review || review._id !== (args as { reviewRequestId?: unknown }).reviewRequestId) {
          throw new Error('private application denial: unknown review')
        }
        return review
      }
      throw new Error(`Unexpected query: ${String(name)}`)
    },
    async runMutation(reference: unknown, args: Record<string, unknown>) {
      const name = functionName(reference)
      calls.push({ functionName: name, args })
      if (typeof name === 'string' && name.endsWith('/mcpCredentials/admitAccessBySecretHash')) {
        return credentialActive
          ? {
              kind: 'access',
              access: {
                apiKeyId: 'mcp_credential_1',
                ownerUserId: 'owner-1',
                scopes,
                expiresAt: null,
              },
            }
          : { kind: 'invalid' }
      }
      if (name === 'ginkoCms/mcpOperations:startAgentRun') {
        return { _id: 'run-1', status: 'active', taskName: args.taskName }
      }
      if (name === 'ginkoCms/mcpOperations:completeAgentRun') {
        return { _id: args.agentRunId, status: 'completed', taskName: 'Update entry' }
      }
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
      if (name === 'ginkoCms/mcpOperations:requestPublishReview') {
        if (!review) {
          review = {
            _id: 'review-1',
            isStale: false,
            status: 'pending',
            operationKey: args.operationKey,
          }
        } else if (review.operationKey !== args.operationKey) {
          throw new Error('private operation conflict')
        }
        return review
      }
      const expectedVersion =
        name === 'ginkoCms/mcpOperations:previewPublish'
          ? args.expectedVersion
          : args.expectedDraftVersion
      if (expectedVersion !== draftVersion) {
        const error = new Error('opaque') as Error & { data: unknown }
        error.data = { code: 'ENTRY_DRAFT_VERSION_CONFLICT' }
        throw error
      }
      if (name === 'ginkoCms/mcpOperations:previewPublish') {
        return {
          allowed: true,
          blockers: [],
          confirmation: null,
          effects: [{ count: 1, kind: 'routes', summary: 'Public routes affected' }],
          summary: 'Publish impact for entry entry-1 (en): ready.',
          warnings: [],
        }
      }
      draftVersion += 1
      return { draftVersion, affectedLocales: [], sharedUpdated: true }
    },
  }
  return {
    calls,
    ctx,
    revoke: () => {
      credentialActive = false
    },
    denyApplication: (reason: 'revoked-member' | 'cross-tenant') => {
      applicationAccess = reason
    },
    setScopes: (next: string[]) => {
      scopes = next
    },
  }
}

async function callTool(
  fixture: ReturnType<typeof createFixture>,
  name: string,
  args: Record<string, unknown>,
  token = bearer,
  interaction?: {
    inputResponses?: Record<string, unknown>
    requestState?: string
    supportsUrl?: boolean
  },
) {
  const handler = createGinkoMcpHandler(fixture.ctx as never, new URL(resource.origin), application)
  const response = await handler.fetch(
    fixture.ctx as never,
    new Request(resource, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/clientInfo': {
              name: 'ginko-mcp-test',
              version: '0.1.0',
            },
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': interaction?.supportsUrl
              ? { elicitation: { url: {} } }
              : {},
          },
          ...(interaction?.inputResponses === undefined
            ? {}
            : { inputResponses: interaction.inputResponses }),
          ...(interaction?.requestState === undefined
            ? {}
            : { requestState: interaction.requestState }),
        },
      }),
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'mcp-method': 'tools/call',
        'mcp-name': name,
        'mcp-protocol-version': '2026-07-28',
      },
      method: 'POST',
    }),
  )
  const text = await response.text()
  return {
    response,
    text,
    body: JSON.parse(text.startsWith('data: ') ? text.slice(6).trim() : text) as Record<
      string,
      unknown
    >,
  }
}

describe('Ginko Convex-native MCP endpoint', () => {
  it('advertises one explicit finite tool inventory', async () => {
    const fixture = createFixture()
    const handler = createGinkoMcpHandler(
      fixture.ctx as never,
      new URL(resource.origin),
      application,
    )
    const response = await handler.fetch(
      fixture.ctx as never,
      new Request(resource, {
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/clientInfo': {
                name: 'ginko-inventory-test',
                version: '0.1.0',
              },
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          'mcp-method': 'tools/list',
          'mcp-protocol-version': '2026-07-28',
        },
        method: 'POST',
      }),
    )
    const text = await response.text()
    const body = JSON.parse(text.startsWith('data: ') ? text.slice(6).trim() : text) as {
      result: { tools: Array<{ name: string }> }
    }

    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual([
      'complete-agent-run',
      'get-entry',
      'get-review-status',
      'preview-publish',
      'request-publish-review',
      'save-entry-draft',
      'start-agent-run',
    ])
  })

  it('projects one canonical review through optional RC URL interaction without granting approval', async () => {
    const fixture = createFixture()
    const operationKey = 'publish-review-operation-000000000001'
    const args = {
      operationKey,
      agentRunId: 'run-1',
      entryId: 'entry-1',
      locales: ['en'],
      expectedVersion: 1,
      title: 'Publish entry',
      summary: 'Ready for publisher review.',
    }

    const unsupported = await callTool(fixture, 'request-publish-review', args)
    expect(unsupported.body).toMatchObject({
      result: {
        structuredContent: {
          interaction: 'client_interaction_unsupported',
          review: { id: 'review-1', isStale: false, status: 'pending' },
        },
      },
    })
    expect(unsupported.text).not.toContain('/api/_ginko/reviews/')

    const pending = await callTool(fixture, 'request-publish-review', args, bearer, {
      supportsUrl: true,
    })
    expect(pending.body).toMatchObject({
      result: {
        resultType: 'input_required',
        requestState: operationKey,
        inputRequests: {
          review: {
            params: {
              mode: 'url',
              url: 'https://app.example.test/api/_ginko/reviews/review-1',
            },
          },
        },
      },
    })

    const acceptedByHostOnly = await callTool(fixture, 'request-publish-review', args, bearer, {
      supportsUrl: true,
      requestState: operationKey,
      inputResponses: { review: { action: 'accept' } },
    })
    expect(acceptedByHostOnly.body).toMatchObject({
      result: {
        structuredContent: {
          interaction: 'pending_external_review',
          review: { id: 'review-1', isStale: false, status: 'pending' },
        },
      },
    })

    const status = await callTool(fixture, 'get-review-status', {
      reviewRequestId: 'review-1',
    })
    expect(status.body).toMatchObject({
      result: {
        structuredContent: { review: { id: 'review-1', isStale: false, status: 'pending' } },
      },
    })

    const tampered = await callTool(fixture, 'request-publish-review', args, bearer, {
      supportsUrl: true,
      requestState: 'forged-review-operation-000000000001',
      inputResponses: { review: { action: 'accept' } },
    })
    expect(tampered.body).toMatchObject({
      result: {
        isError: true,
        structuredContent: { error: { code: 'MCP_INTERACTION_STATE_INVALID' } },
      },
    })
    expect(JSON.stringify(fixture.calls)).not.toContain(bearer)
    expect(JSON.stringify([unsupported.body, pending.body, acceptedByHostOnly.body])).not.toContain(
      bearer,
    )
  })

  it('maps one read and ordinary draft write without passing the bearer into Convex args', async () => {
    const fixture = createFixture()
    const run = await callTool(fixture, 'start-agent-run', { taskName: 'Update entry' })
    expect(run.body).toMatchObject({
      result: { structuredContent: { run: { _id: 'run-1', status: 'active' } } },
    })
    const read = await callTool(fixture, 'get-entry', { entryId: 'entry-1' })
    expect(read.response.status).toBe(200)
    expect(read.body).toMatchObject({
      result: { structuredContent: { entry: { _id: 'entry-1', draftVersion: 1 } } },
    })

    const write = await callTool(fixture, 'save-entry-draft', {
      agentRunId: 'run-1',
      entryId: 'entry-1',
      expectedDraftVersion: 1,
      patch: { shared: { slug: 'updated' } },
    })
    expect(write.body).toMatchObject({
      result: { structuredContent: { result: { draftVersion: 2 } } },
    })
    const preview = await callTool(fixture, 'preview-publish', {
      agentRunId: 'run-1',
      entryId: 'entry-1',
      expectedVersion: 2,
      locales: ['en'],
    })
    expect(preview.body).toMatchObject({
      result: {
        structuredContent: {
          preview: {
            effects: [{ count: 1, kind: 'routes', summary: 'Public routes affected' }],
          },
          publicChanged: false,
        },
      },
    })
    const completed = await callTool(fixture, 'complete-agent-run', { agentRunId: 'run-1' })
    expect(completed.body).toMatchObject({
      result: { structuredContent: { run: { _id: 'run-1', status: 'completed' } } },
    })
    expect(JSON.stringify(fixture.calls)).not.toContain(bearer)
    expect(JSON.stringify(read.body)).not.toContain(bearer)
    expect(JSON.stringify(write.body)).not.toContain(bearer)
    expect(JSON.stringify(preview.body)).not.toContain(bearer)
  })

  it('fails current credential, scope, and optimistic-concurrency checks safely', async () => {
    const fixture = createFixture()
    const conflict = await callTool(fixture, 'save-entry-draft', {
      agentRunId: 'run-1',
      entryId: 'entry-1',
      expectedDraftVersion: 0,
      patch: {},
    })
    expect(conflict.body).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: { category: 'conflict', code: 'ENTRY_DRAFT_VERSION_CONFLICT', retryable: true },
        },
      },
    })

    fixture.setScopes(['readCms'])
    const denied = await callTool(fixture, 'save-entry-draft', {
      agentRunId: 'run-1',
      entryId: 'entry-1',
      expectedDraftVersion: 1,
      patch: {},
    })
    expect(denied.body).toMatchObject({
      result: { isError: true, structuredContent: { error: { code: 'MCP_CAPABILITY_REQUIRED' } } },
    })

    fixture.revoke()
    const revoked = await callTool(fixture, 'get-entry', { entryId: 'entry-1' })
    expect(revoked.response.status).toBe(401)
    expect(revoked.response.headers.get('www-authenticate')).not.toContain('resource_metadata')
    expect(revoked.text).not.toContain(bearer)
  })

  it.each(['revoked-member', 'cross-tenant'] as const)(
    'keeps current application denial opaque for %s access',
    async (reason) => {
      const fixture = createFixture()
      fixture.denyApplication(reason)

      const denied = await callTool(fixture, 'get-entry', { entryId: 'entry-foreign' })

      expect(denied.response.status).toBe(200)
      expect(denied.body).toMatchObject({ result: { isError: true } })
      expect(denied.text).not.toContain('private application denial')
      expect(denied.text).not.toContain(reason)
      expect(denied.text).not.toContain(bearer)
    },
  )
})
