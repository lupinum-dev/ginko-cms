export function createMcpProof({
  baseUrl,
  page,
  story,
  redact,
  registerSecret,
  collection,
  fixtureToken,
  fixtureManifest,
  certification,
}) {
  let activeConnection = null
  let activeAgentRun = null
  let reviewRequest = null
  let requestId = 2

  async function initialize(rawKey) {
    return await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(rawKey ? { authorization: `Bearer ${rawKey}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'ginko-live-story-smoke', version: '0.0.0' },
        },
      }),
    })
  }

  function parseEnvelope(text) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
    const envelope = JSON.parse(dataLines.length ? dataLines.join('\n') : text)
    if (envelope.error) {
      throw new Error(`MCP error ${envelope.error.code}: ${envelope.error.message}`)
    }
    return envelope
  }

  async function request(rawKey, method, params = {}) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`MCP ${method} failed ${response.status}: ${redact(text).slice(0, 300)}`)
    }
    return parseEnvelope(text)
  }

  async function tool(rawKey, name, args = {}) {
    const envelope = await request(rawKey, 'tools/call', { name, arguments: args })
    return envelope.result?.structuredContent
  }

  async function revoke() {
    if (!activeConnection || activeConnection.revoked) return null
    await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
    const row = page
      .getByText(activeConnection.label)
      .locator('xpath=ancestor::*[self::tr or self::li or self::div][.//button][1]')
    await row
      .getByRole('button', { name: /revoke/i })
      .first()
      .click()
    const dialog = page.getByRole('dialog', { name: 'Revoke MCP access?' })
    await dialog.waitFor({ timeout: 30000 })
    await dialog.getByRole('button', { name: 'Revoke access' }).click()
    await page.getByText('MCP connection revoked.').waitFor({ timeout: 30000 })
    activeConnection.revoked = true
    const revoked = await initialize(activeConnection.rawKey)
    if (revoked.status !== 401) throw new Error(`revoked MCP key returned ${revoked.status}`)
    return revoked.status
  }

  async function runStories() {
    await story(
      'mcp.unauthenticated-rejected',
      'Unauthenticated MCP initialize is rejected',
      async () => {
        const response = await initialize('')
        if (response.status !== 401) {
          throw new Error(`unauthenticated MCP returned ${response.status}`)
        }
        return { status: response.status }
      },
    )

    await story('mcp.malformed-auth-rejected', 'Malformed MCP auth shape is rejected', async () => {
      const rawHeader = 'x-api-key not-a-valid-ginko-cms-story-key'
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: rawHeader,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'ginko-live-story-smoke', version: '0.0.0' },
          },
        }),
      })
      const text = await response.text()
      if (response.status !== 401) throw new Error(`malformed MCP auth returned ${response.status}`)
      if (text.includes(rawHeader)) throw new Error('malformed MCP auth was reflected in output')
      return { status: response.status }
    })

    await story('mcp.unknown-key-rejected', 'Unknown MCP bearer key is rejected', async () => {
      const unknownKey = 'not-a-valid-ginko-cms-story-key'
      const response = await initialize(unknownKey)
      const text = await response.text()
      if (response.status !== 401) throw new Error(`unknown MCP key returned ${response.status}`)
      if (text.includes(unknownKey))
        throw new Error('unknown MCP key was reflected in failure output')
      return { status: response.status }
    })

    await story(
      'mcp.create-authenticated',
      'MCP connection can be created and used for initialize',
      async () => {
        await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
        const label = `Proof ${fixtureToken}`.slice(0, 80)
        await page.locator('input[placeholder="Preview client"]').fill(label)
        const responsePromise = page.waitForResponse(
          (response) => response.url().includes('/api/auth/api-key/create'),
          { timeout: 30000 },
        )
        await page.getByRole('button', { name: 'Create MCP connection' }).click()
        const response = await responsePromise
        const body = await response.json().catch(() => null)
        if (!response.ok()) {
          throw new Error(
            `API key create failed ${response.status()}: ${redact(JSON.stringify(body))}`,
          )
        }
        const rawKey = body?.key ?? body?.data?.key
        const keyId = body?.id ?? body?.data?.id
        if (!rawKey || !keyId) throw new Error('API key create response did not include key/id')
        activeConnection = { label, rawKey, keyId, revoked: false }
        registerSecret(rawKey)
        await page.getByText('MCP connection created.').waitFor({ timeout: 30000 })
        await page.getByText(label).waitFor({ timeout: 30000 })
        await page.getByText(rawKey, { exact: true }).waitFor({ timeout: 30000 })

        const auth = await initialize(rawKey)
        const authText = await auth.text()
        if (!auth.ok || !authText.includes('protocolVersion')) {
          throw new Error(
            `authenticated MCP initialize failed ${auth.status}: ${redact(authText).slice(0, 300)}`,
          )
        }
        return { apiKeyIdLength: keyId.length, authenticatedStatus: auth.status }
      },
    )

    await story(
      'mcp.raw-key-one-time-visible',
      'Raw MCP key is only visible at creation time',
      async () => {
        if (!activeConnection?.rawKey) throw new Error('MCP connection was not created')
        const visibleAtCreation = await page
          .getByText(activeConnection.rawKey, { exact: true })
          .isVisible()
          .catch(() => false)
        if (!visibleAtCreation)
          throw new Error('raw MCP key was not visible immediately at creation')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
        await page.getByText(activeConnection.label).waitFor({ timeout: 30000 })
        const visibleAfterReload = await page
          .getByText(activeConnection.rawKey, { exact: true })
          .isVisible()
          .catch(() => false)
        if (visibleAfterReload)
          throw new Error('raw MCP key remained visible after settings reload')
        return { visibleAtCreation, visibleAfterReload }
      },
    )

    await story(
      'mcp.tools-list-and-read',
      'MCP tools list and read published CMS data',
      async () => {
        if (!activeConnection?.rawKey) throw new Error('MCP connection was not created')
        const rawKey = activeConnection.rawKey
        const toolsEnvelope = await request(rawKey, 'tools/list')
        const tools = toolsEnvelope.result?.tools
        if (!Array.isArray(tools)) throw new Error('tools/list did not return a tool array')
        const toolNames = tools.map((item) => item.name)
        for (const name of [
          'list-collections',
          'get-collection',
          'list-entries',
          'get-entry',
          'start-agent-run',
          'complete-agent-run',
          'preview-publish',
          'request-publish-review',
          'get-review-status',
          'list',
          'search',
        ]) {
          if (!toolNames.includes(name)) throw new Error(`tools/list missing ${name}`)
        }
        for (const forbidden of [
          'publish-entry',
          'archive-entry',
          'restore-entry',
          'delete-entry',
          'record-activity',
          'record-audit',
        ]) {
          if (toolNames.includes(forbidden)) {
            throw new Error(`tools/list exposed forbidden public-output tool ${forbidden}`)
          }
        }

        const collections = await tool(rawKey, 'list-collections')
        const collectionList = collections?.collections
        if (
          !Array.isArray(collectionList) ||
          !collectionList.some((item) => item.slug === collection)
        ) {
          throw new Error(`list-collections did not include ${collection}`)
        }
        const collectionResult = await tool(rawKey, 'get-collection', {
          slug: collection,
          compact: true,
        })
        if (collectionResult?.slug !== collection || collectionResult?.routing?.mode !== 'route') {
          throw new Error(`get-collection did not return compact ${collection} route metadata`)
        }
        const cmsEntries = await tool(rawKey, 'list-entries', { collection, locale: 'en' })
        const editableEntries = cmsEntries?.entries
        if (!Array.isArray(editableEntries) || editableEntries.length < 1) {
          throw new Error('list-entries did not return CMS entries')
        }
        const entryId = editableEntries[0]?._id ?? editableEntries[0]?.id
        if (!entryId) throw new Error('list-entries did not return an entry id')
        const cmsEntry = await tool(rawKey, 'get-entry', { entryId, locale: 'en', compact: true })
        if (cmsEntry?.collection !== collection || cmsEntry?.entryId !== entryId) {
          throw new Error('get-entry did not return the requested compact CMS entry')
        }
        const publicList = await tool(rawKey, 'list', {
          collection,
          locale: 'en',
          limit: 1,
          compact: true,
        })
        if (!Array.isArray(publicList?.entries) || publicList.entries.length !== 1) {
          throw new Error('public list tool did not return one compact entry')
        }
        const firstEntry = publicList.entries[0]
        if (!firstEntry?.route?.path || JSON.stringify(firstEntry).includes('draftData')) {
          throw new Error('public list tool returned invalid or draft-shaped entry data')
        }
        const search = await tool(rawKey, 'search', {
          collection,
          locale: 'en',
          query: fixtureToken,
          limit: 2,
          compact: true,
        })
        if (!Array.isArray(search?.results))
          throw new Error('public search tool returned invalid data')
        return {
          toolCount: tools.length,
          collectionCount: collectionList.length,
          cmsEntryCount: editableEntries.length,
          firstPublicPath: firstEntry.route.path,
          searchResults: search.results.length,
        }
      },
    )

    if (certification) {
      await story(
        'mcp.draft-review-gated',
        'MCP can preview and request human review but cannot publish directly',
        async () => {
          if (!activeConnection?.rawKey) throw new Error('MCP connection was not created')
          const probe = fixtureManifest.probes.mcpReview
          const rawKey = activeConnection.rawKey
          const run = await tool(rawKey, 'start-agent-run', {
            taskName: `Live proof ${fixtureToken}`,
          })
          const agentRunId = run?._id ?? run?.id
          if (!agentRunId) throw new Error('start-agent-run did not return a run id')
          activeAgentRun = { id: agentRunId, completed: false }
          const preview = await tool(rawKey, 'preview-publish', {
            agentRunId,
            entryId: probe.entryId,
            locales: [probe.locale],
            expectedVersion: probe.expectedVersion,
            message: 'Automated review-gating certification.',
          })
          if (preview?.publicChanged !== false || !preview?.preview) {
            throw new Error('MCP preview did not prove unchanged public output')
          }
          const requested = await tool(rawKey, 'request-publish-review', {
            agentRunId,
            entryId: probe.entryId,
            locales: [probe.locale],
            expectedVersion: probe.expectedVersion,
            title: probe.reviewTitle,
            summary: 'Automated MCP review-gating certification.',
          })
          const review = requested?.reviewRequest
          const reviewRequestId = review?._id ?? review?.id
          if (requested?.publicChanged !== false || !reviewRequestId) {
            throw new Error('MCP review request did not remain review-gated')
          }
          reviewRequest = { id: reviewRequestId, title: probe.reviewTitle, approved: false }
          const status = await tool(rawKey, 'get-review-status', { reviewRequestId })
          if (!status || status.status !== 'pending') {
            throw new Error(`new MCP review was not pending: ${redact(JSON.stringify(status))}`)
          }
          return {
            agentRunId,
            reviewRequestId,
            status: status.status,
            publicChanged: false,
            directPublishToolAvailable: false,
          }
        },
      )

      await story(
        'mcp.human-approval',
        'Owner approval publishes the MCP-requested review through the guarded workflow',
        async () => {
          if (!reviewRequest) throw new Error('MCP review request was not created')
          await page.goto(`${baseUrl}/studio/reviews`, { waitUntil: 'domcontentloaded' })
          const review = page.locator('article').filter({ hasText: reviewRequest.title })
          await review.waitFor({ timeout: 30000 })
          await review.getByRole('button', { name: 'Approve and publish' }).click()
          const dialog = page.getByRole('dialog', { name: 'Approve and publish?' })
          await dialog.waitFor({ timeout: 30000 })
          await dialog.getByRole('button', { name: 'Approve and publish' }).click()
          await page.getByText('Approved', { exact: true }).first().waitFor({ timeout: 30000 })
          reviewRequest.approved = true
          const status = await tool(activeConnection.rawKey, 'get-review-status', {
            reviewRequestId: reviewRequest.id,
          })
          if (status?.status !== 'approved') {
            throw new Error(`approved MCP review returned ${String(status?.status)}`)
          }
          await tool(activeConnection.rawKey, 'complete-agent-run', {
            agentRunId: activeAgentRun.id,
          })
          activeAgentRun.completed = true
          return { reviewRequestId: reviewRequest.id, status: status.status, runCompleted: true }
        },
      )
    }

    await story('mcp.revoke', 'MCP connection can be revoked', async () => ({
      revokedStatus: await revoke(),
    }))
  }

  async function cleanup() {
    const failures = []
    if (activeAgentRun && !activeAgentRun.completed && activeConnection?.rawKey) {
      await tool(activeConnection.rawKey, 'complete-agent-run', { agentRunId: activeAgentRun.id })
        .then(() => (activeAgentRun.completed = true))
        .catch((error) => {
          failures.push({
            id: 'mcp.run-cleanup',
            title: 'Complete active MCP agent run after failure',
            status: 'failed',
            durationMs: 0,
            error: redact(error instanceof Error ? error.message : String(error)),
          })
        })
    }
    if (activeConnection && !activeConnection.revoked) {
      await revoke().catch((error) => {
        failures.push({
          id: 'mcp.cleanup',
          title: 'Cleanup active MCP connection after failure',
          status: 'failed',
          durationMs: 0,
          error: redact(error instanceof Error ? error.message : String(error)),
        })
      })
    }
    return {
      failures,
      status: {
        mcpConnectionRevoked: activeConnection === null || activeConnection.revoked === true,
        mcpAgentRunCompleted: activeAgentRun === null || activeAgentRun.completed === true,
        mcpReviewApproved: reviewRequest === null || reviewRequest.approved === true,
      },
    }
  }

  return { runStories, cleanup }
}
