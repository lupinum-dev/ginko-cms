import { createHash, randomBytes } from 'node:crypto'

export function createMcpProof({
  baseUrl,
  mcpBaseUrl,
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
  const oauthScopes = ['cms.read', 'cms.entries.edit']

  async function initialize(accessToken) {
    return await fetch(`${mcpBaseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2026-07-28',
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

  async function request(accessToken, method, params = {}) {
    const response = await fetch(`${mcpBaseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`MCP ${method} failed ${response.status}: ${redact(text).slice(0, 300)}`)
    }
    return parseEnvelope(text)
  }

  async function tool(accessToken, name, args = {}) {
    const envelope = await request(accessToken, 'tools/call', { name, arguments: args })
    const result = envelope.result
    if (result?.isError) {
      throw new Error(
        `MCP tool ${name} failed: ${redact(JSON.stringify(result.structuredContent)).slice(0, 500)}`,
      )
    }
    return result?.structuredContent
  }

  async function authenticatedAuthPost(path, body) {
    return await page.evaluate(
      async ({ body, path }) => {
        const response = await fetch(path, {
          body: JSON.stringify(body),
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        return {
          body: await response.json().catch(() => null),
          status: response.status,
        }
      },
      { body, path },
    )
  }

  async function discoverAuthorizationServer() {
    const challenge = await initialize('')
    if (challenge.status !== 401) {
      throw new Error(`unauthenticated MCP discovery returned ${challenge.status}`)
    }
    const authenticate = challenge.headers.get('www-authenticate') ?? ''
    const metadataMatch = authenticate.match(/\bresource_metadata="([^"]+)"/u)
    if (!metadataMatch?.[1]) {
      throw new Error('MCP challenge omitted OAuth protected-resource metadata.')
    }
    const resourceResponse = await fetch(metadataMatch[1], {
      headers: { accept: 'application/json' },
    })
    const resourceMetadata = await resourceResponse.json().catch(() => null)
    const resource = resourceMetadata?.resource
    const issuer = resourceMetadata?.authorization_servers?.[0]
    if (!resourceResponse.ok || typeof resource !== 'string' || typeof issuer !== 'string') {
      throw new Error('MCP protected-resource metadata is invalid.')
    }
    const issuerUrl = new URL(issuer)
    const metadataUrls = [
      new URL(`/.well-known/oauth-authorization-server${issuerUrl.pathname}`, issuerUrl.origin),
      new URL(
        `${issuerUrl.pathname.replace(/\/$/u, '')}/.well-known/oauth-authorization-server`,
        issuerUrl.origin,
      ),
    ]
    let authorizationMetadata = null
    let authorizationMetadataUrl = null
    for (const metadataUrl of metadataUrls) {
      const response = await fetch(metadataUrl, { headers: { accept: 'application/json' } })
      if (!response.ok) continue
      authorizationMetadata = await response.json().catch(() => null)
      authorizationMetadataUrl = metadataUrl.href
      break
    }
    if (
      authorizationMetadata?.issuer !== issuer ||
      typeof authorizationMetadata?.authorization_endpoint !== 'string' ||
      typeof authorizationMetadata?.token_endpoint !== 'string' ||
      !authorizationMetadata?.code_challenge_methods_supported?.includes('S256')
    ) {
      throw new Error('OAuth authorization-server metadata is invalid.')
    }
    return {
      authorizationMetadata,
      authorizationMetadataUrl,
      resource,
      resourceMetadataUrl: metadataMatch[1],
    }
  }

  async function revoke() {
    if (!activeConnection) return null
    let revokedStatus = null
    if (!activeConnection.revoked) {
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
      if (activeConnection.accessToken) {
        const revoked = await initialize(activeConnection.accessToken)
        if (revoked.status !== 401) {
          throw new Error(`revoked MCP OAuth token returned ${revoked.status}`)
        }
        revokedStatus = revoked.status
      }
    }
    if (!activeConnection.clientDeleted) {
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      const deleted = await authenticatedAuthPost('/api/auth/oauth2/delete-client', {
        client_id: activeConnection.clientId,
      })
      if (deleted.status < 200 || deleted.status >= 300) {
        throw new Error(`OAuth client cleanup returned ${deleted.status}`)
      }
      activeConnection.clientDeleted = true
    }
    return revokedStatus
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
      const response = await fetch(`${mcpBaseUrl}/mcp`, {
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
            protocolVersion: '2026-07-28',
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
      'MCP OAuth completes PKCE authorization and initializes with delegated access',
      async () => {
        const discovery = await discoverAuthorizationServer()
        await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
        const label = `Proof ${fixtureToken}`.slice(0, 80)
        const redirectUri = `${baseUrl}/oauth-proof/callback`
        const created = await authenticatedAuthPost('/api/auth/oauth2/create-client', {
          client_name: label,
          grant_types: ['authorization_code'],
          redirect_uris: [redirectUri],
          response_types: ['code'],
          scope: oauthScopes.join(' '),
          token_endpoint_auth_method: 'none',
          type: 'native',
        })
        const clientId = created.body?.client_id
        if (created.status < 200 || created.status >= 300 || typeof clientId !== 'string') {
          throw new Error(`OAuth client creation returned ${created.status}`)
        }
        activeConnection = {
          accessToken: null,
          clientDeleted: false,
          clientId,
          label,
          revoked: true,
        }
        await page.locator('input[placeholder="Preview client"]').fill(label)
        await page.locator('input[placeholder="Registered client ID"]').fill(clientId)
        const createScope = page.getByRole('checkbox', { name: 'Create entries' })
        if (await createScope.isChecked()) await createScope.click()
        if (await createScope.isChecked()) {
          throw new Error('MCP delegation retained an unrequested create scope.')
        }
        await page.getByRole('button', { name: 'Create MCP connection' }).click()
        await page.getByText('MCP connection created.').waitFor({ timeout: 30000 })
        await page.getByText(label).waitFor({ timeout: 30000 })
        activeConnection.revoked = false

        const verifier = randomBytes(48).toString('base64url')
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        const state = randomBytes(24).toString('base64url')
        const authorizationUrl = new URL(discovery.authorizationMetadata.authorization_endpoint)
        for (const [name, value] of [
          ['client_id', clientId],
          ['code_challenge', challenge],
          ['code_challenge_method', 'S256'],
          ['redirect_uri', redirectUri],
          ['resource', discovery.resource],
          ['response_type', 'code'],
          ['scope', oauthScopes.join(' ')],
          ['state', state],
        ]) {
          authorizationUrl.searchParams.set(name, value)
        }
        await page.goto(authorizationUrl.href, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Authorize MCP access' }).waitFor({
          timeout: 30000,
        })
        await page.getByTestId('oauth-approve').click()
        await page.waitForURL((url) => url.href.startsWith(redirectUri), { timeout: 30000 })
        const callback = new URL(page.url())
        const code = callback.searchParams.get('code')
        if (!code || callback.searchParams.get('state') !== state) {
          throw new Error('OAuth authorization callback did not preserve code and state.')
        }
        const tokenResponse = await fetch(discovery.authorizationMetadata.token_endpoint, {
          body: new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            resource: discovery.resource,
          }),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        })
        const tokenBody = await tokenResponse.json().catch(() => null)
        const accessToken = tokenBody?.access_token
        const grantedScopes =
          typeof tokenBody?.scope === 'string' ? tokenBody.scope.split(/\s+/u).filter(Boolean) : []
        if (
          !tokenResponse.ok ||
          typeof accessToken !== 'string' ||
          tokenBody?.token_type?.toLowerCase() !== 'bearer' ||
          !Number.isFinite(tokenBody?.expires_in) ||
          tokenBody.expires_in > 600 ||
          grantedScopes.length !== oauthScopes.length ||
          oauthScopes.some((scope) => !grantedScopes.includes(scope))
        ) {
          throw new Error(`OAuth token exchange returned ${tokenResponse.status}`)
        }
        activeConnection.accessToken = accessToken
        registerSecret(accessToken)

        const auth = await initialize(accessToken)
        const authText = await auth.text()
        if (!auth.ok || !authText.includes('protocolVersion')) {
          throw new Error(
            `authenticated MCP initialize failed ${auth.status}: ${redact(authText).slice(0, 300)}`,
          )
        }
        return {
          authenticatedStatus: auth.status,
          authorizationMetadataUrl: discovery.authorizationMetadataUrl,
          clientId,
          pkce: 'S256',
          resource: discovery.resource,
          resourceMetadataUrl: discovery.resourceMetadataUrl,
          scopes: grantedScopes,
          tokenLifetimeSeconds: tokenBody.expires_in,
        }
      },
    )

    await story(
      'mcp.oauth-token-not-rendered',
      'OAuth bearer credentials are never rendered in Studio',
      async () => {
        if (!activeConnection?.accessToken) throw new Error('MCP OAuth was not completed')
        await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
        await page.getByText(activeConnection.label).waitFor({ timeout: 30000 })
        const visible = await page
          .getByText(activeConnection.accessToken, { exact: true })
          .isVisible()
          .catch(() => false)
        if (visible) throw new Error('OAuth bearer token was rendered in Studio')
        return { rendered: false }
      },
    )

    await story(
      'mcp.tools-list-and-read',
      'MCP tools list and read published CMS data',
      async () => {
        if (!activeConnection?.accessToken) throw new Error('MCP OAuth was not completed')
        const accessToken = activeConnection.accessToken
        const toolsEnvelope = await request(accessToken, 'tools/list')
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

        const collections = await tool(accessToken, 'list-collections')
        const collectionList = collections?.collections
        if (
          !Array.isArray(collectionList) ||
          !collectionList.some((item) => item.slug === collection)
        ) {
          throw new Error(`list-collections did not include ${collection}`)
        }
        const collectionResult = await tool(accessToken, 'get-collection', {
          slug: collection,
          compact: true,
        })
        if (collectionResult?.slug !== collection || collectionResult?.routing?.mode !== 'route') {
          throw new Error(`get-collection did not return compact ${collection} route metadata`)
        }
        const cmsEntries = await tool(accessToken, 'list-entries', { collection, locale: 'en' })
        const editableEntries = cmsEntries?.entries
        if (!Array.isArray(editableEntries) || editableEntries.length < 1) {
          throw new Error('list-entries did not return CMS entries')
        }
        const entryId = editableEntries[0]?._id ?? editableEntries[0]?.id
        if (!entryId) throw new Error('list-entries did not return an entry id')
        const cmsEntryResult = await tool(accessToken, 'get-entry', { entryId, locale: 'en' })
        const cmsEntry = cmsEntryResult?.entry
        if (cmsEntry?.collection !== collection || cmsEntry?._id !== entryId) {
          throw new Error('get-entry did not return the requested CMS entry')
        }
        const publicList = await tool(accessToken, 'list', {
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
        const search = await tool(accessToken, 'search', {
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
          if (!activeConnection?.accessToken) throw new Error('MCP OAuth was not completed')
          const probe = fixtureManifest.probes.mcpReview
          const accessToken = activeConnection.accessToken
          const run = await tool(accessToken, 'start-agent-run', {
            taskName: `Live proof ${fixtureToken}`,
          })
          const agentRunId = run?.run?._id ?? run?.run?.id
          if (!agentRunId) throw new Error('start-agent-run did not return a run id')
          activeAgentRun = { id: agentRunId, completed: false }
          const preview = await tool(accessToken, 'preview-publish', {
            agentRunId,
            entryId: probe.entryId,
            locales: [probe.locale],
            expectedVersion: probe.expectedVersion,
            message: 'Automated review-gating certification.',
          })
          if (preview?.publicChanged !== false || !preview?.preview) {
            throw new Error('MCP preview did not prove unchanged public output')
          }
          const operationKey = createHash('sha256').update(`review:${fixtureToken}`).digest('hex')
          const reviewArgs = {
            operationKey,
            agentRunId,
            entryId: probe.entryId,
            locales: [probe.locale],
            expectedVersion: probe.expectedVersion,
            title: probe.reviewTitle,
            summary: 'Automated MCP review-gating certification.',
          }
          const requested = await tool(accessToken, 'request-publish-review', reviewArgs)
          const reviewRequestId = requested?.review?.id
          if (requested?.interaction !== 'client_interaction_unsupported' || !reviewRequestId) {
            throw new Error('MCP review request did not remain review-gated')
          }
          const replayed = await tool(accessToken, 'request-publish-review', reviewArgs)
          if (
            replayed?.interaction !== 'client_interaction_unsupported' ||
            replayed?.review?.id !== reviewRequestId
          ) {
            throw new Error('MCP review request replay created a second effect')
          }
          reviewRequest = { id: reviewRequestId, title: probe.reviewTitle, approved: false }
          const status = await tool(accessToken, 'get-review-status', { reviewRequestId })
          if (!status || status.review?.status !== 'pending') {
            throw new Error(`new MCP review was not pending: ${redact(JSON.stringify(status))}`)
          }
          return {
            agentRunId,
            reviewRequestId,
            status: status.review.status,
            publicChanged: false,
            directPublishToolAvailable: false,
            exactlyOnceReplay: true,
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
          const status = await tool(activeConnection.accessToken, 'get-review-status', {
            reviewRequestId: reviewRequest.id,
          })
          if (status?.review?.status !== 'approved') {
            throw new Error(`approved MCP review returned ${String(status?.review?.status)}`)
          }
          await tool(activeConnection.accessToken, 'complete-agent-run', {
            agentRunId: activeAgentRun.id,
          })
          activeAgentRun.completed = true
          return {
            reviewRequestId: reviewRequest.id,
            status: status.review.status,
            runCompleted: true,
          }
        },
      )
    }

    await story('mcp.revoke', 'MCP connection can be revoked', async () => ({
      revokedStatus: await revoke(),
    }))
  }

  async function cleanup() {
    const failures = []
    if (activeAgentRun && !activeAgentRun.completed && activeConnection?.accessToken) {
      await tool(activeConnection.accessToken, 'complete-agent-run', {
        agentRunId: activeAgentRun.id,
      })
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
    if (activeConnection && (!activeConnection.revoked || !activeConnection.clientDeleted)) {
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
        mcpOAuthClientDeleted: activeConnection === null || activeConnection.clientDeleted === true,
        mcpAgentRunCompleted: activeAgentRun === null || activeAgentRun.completed === true,
        mcpReviewApproved: reviewRequest === null || reviewRequest.approved === true,
      },
    }
  }

  return { runStories, cleanup }
}
