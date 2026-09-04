import { describe, expect, it } from 'vitest'

import { handleGinkoMcpRequest } from '../../packages/convex/src/mcpHandler'

const resource = new URL('https://ginko.example.test/mcp')
const application = new URL('https://app.example.test')
const bearer = 'ginko-mcp-bearer-sentinel'
const issuer = `${application.origin}/api/auth`
function createFixture(applicationUrl = application) {
  const fixtureIssuer = `${applicationUrl.origin}/api/auth`
  let accessActive = true
  let applicationAccess: 'allowed' | 'revoked-member' | 'cross-tenant' = 'allowed'
  let scopes = ['cms.read', 'cms.entries.edit']
  let draftVersion = 1
  let review: Record<string, unknown> | null = null
  const calls: Array<{ operation: string; args: unknown }> = []
  const caller = {
    clientId: 'client-ginko-test',
    issuer: fixtureIssuer,
    scopes,
    subject: 'owner-1',
  }
  const operations = {
    async getEntry(args: unknown) {
      calls.push({ operation: 'get-entry', args })
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
      return { _id: 'entry-1', draftVersion }
    },
    async getReviewStatus(args: Record<string, unknown>) {
      calls.push({ operation: 'review-status', args })
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
      if (!review || review._id !== args.reviewRequestId) {
        throw new Error('private application denial: unknown review')
      }
      return review
    },
    async startAgentRun(args: Record<string, unknown>) {
      calls.push({ operation: 'start-run', args })
      return { _id: 'run-1', status: 'active', taskName: args.taskName }
    },
    async completeAgentRun(args: Record<string, unknown>) {
      calls.push({ operation: 'complete-run', args })
      return { _id: args.agentRunId, status: 'completed', taskName: 'Update entry' }
    },
    async requestPublishReview(args: Record<string, unknown>) {
      calls.push({ operation: 'request-review', args })
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
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
    },
    async saveEntryDraft(args: Record<string, unknown>) {
      calls.push({ operation: 'save-draft', args })
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
      if (args.expectedDraftVersion !== draftVersion) {
        const error = new Error('opaque') as Error & { data: unknown }
        error.data = { code: 'ENTRY_DRAFT_VERSION_CONFLICT' }
        throw error
      }
      draftVersion += 1
      return { draftVersion, affectedLocales: [], sharedUpdated: true }
    },
    async previewPublish(args: Record<string, unknown>) {
      calls.push({ operation: 'preview-publish', args })
      if (applicationAccess !== 'allowed') {
        throw new Error(`private application denial: ${applicationAccess}`)
      }
      if (args.expectedVersion !== draftVersion) {
        const error = new Error('opaque') as Error & { data: unknown }
        error.data = { code: 'ENTRY_DRAFT_VERSION_CONFLICT' }
        throw error
      }
      return {
        allowed: true,
        blockers: [],
        confirmation: null,
        effects: [{ count: 1, kind: 'routes', summary: 'Public routes affected' }],
        summary: 'Publish impact for entry entry-1 (en): ready.',
        warnings: [],
      }
    },
  }
  const options = {
    authorization: {
      issuer: fixtureIssuer,
      verifier: {
        async verifyAccessToken(
          token: string,
          expected: { readonly issuer: string; readonly resource: URL },
        ) {
          if (!accessActive || token !== bearer) throw new Error('access rejected')
          if (expected.issuer !== fixtureIssuer) throw new Error('issuer mismatch')
          return {
            access: {
              ...caller,
              resource: expected.resource.href,
              scopes: [...scopes],
            },
            expiresAt: Date.now() + 60_000,
          }
        },
      },
    },
    operations: operations as never,
    resource,
    reviewInteractionBase: new URL('/api/_ginko/reviews/', applicationUrl),
  }
  return {
    calls,
    handle: async (request: Request) => await handleGinkoMcpRequest(request, options),
    revoke: () => {
      accessActive = false
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
  const response = await fixture.handle(
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
  it('allows HTTP review interactions only on loopback origins', async () => {
    const local = createFixture(new URL('http://127.0.0.1:3000'))
    await expect(local.handle(new Request(resource))).resolves.toBeInstanceOf(Response)

    const insecure = createFixture(new URL('http://cms.example.test'))
    await expect(insecure.handle(new Request(resource))).rejects.toThrow(/HTTP loopback URL/)
  })

  it('serves exact OAuth resource discovery without projecting authorization metadata', async () => {
    const fixture = createFixture()
    const metadataUrl = 'https://ginko.example.test/.well-known/oauth-protected-resource/mcp'
    const protectedResource = await fixture.handle(new Request(metadataUrl))
    expect(protectedResource.status).toBe(200)
    await expect(protectedResource.json()).resolves.toEqual({
      authorization_servers: [issuer],
      resource: resource.href,
      resource_name: 'Ginko CMS MCP',
      scopes_supported: ['cms.entries.edit', 'cms.read'],
    })

    const preflight = await fixture.handle(new Request(metadataUrl, { method: 'OPTIONS' }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS')

    const head = await fixture.handle(new Request(metadataUrl, { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')

    for (const method of ['GET', 'DELETE']) {
      const unsupported = await fixture.handle(new Request(resource, { method }))
      expect(unsupported.status).toBe(405)
      expect(await unsupported.text()).toBe('')
    }

    const authorizationServer = await fixture.handle(
      new Request('https://ginko.example.test/.well-known/oauth-authorization-server'),
    )
    expect(authorizationServer.status).toBe(404)
    expect(await authorizationServer.text()).toBe('')
  })

  it('advertises one explicit finite tool inventory', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
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

    for (const action of ['decline', 'cancel'] as const) {
      const dismissedByHost = await callTool(fixture, 'request-publish-review', args, bearer, {
        supportsUrl: true,
        requestState: operationKey,
        inputResponses: { review: { action } },
      })
      expect(dismissedByHost.body).toMatchObject({
        result: {
          structuredContent: {
            interaction: 'pending_external_review',
            review: { id: 'review-1', isStale: false, status: 'pending' },
          },
        },
      })
    }

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

    fixture.revoke()
    const revokedStatus = await callTool(fixture, 'get-review-status', {
      reviewRequestId: 'review-1',
    })
    expect(revokedStatus.response.status).toBe(401)
    expect(revokedStatus.text).not.toContain('review-1')
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

  it('fails current OAuth access, scope, and optimistic-concurrency checks safely', async () => {
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

    fixture.setScopes(['cms.read'])
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
    expect(revoked.response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://ginko.example.test/.well-known/oauth-protected-resource/mcp"',
    )
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
