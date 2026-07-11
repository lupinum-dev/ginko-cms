import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

const configuredBaseUrl = process.env.CMS_STORY_BASE_URL
const email = process.env.GINKO_CMS_TEST_EMAIL
const password = process.env.GINKO_CMS_TEST_PASSWORD
const outputPath = process.env.CMS_STORY_OUTPUT ? resolve(process.env.CMS_STORY_OUTPUT) : null

if (!configuredBaseUrl || !email || !password) {
  throw new Error(
    'cms-live-story-smoke requires CMS_STORY_BASE_URL, GINKO_CMS_TEST_EMAIL, and GINKO_CMS_TEST_PASSWORD.',
  )
}

const baseUrl = configuredBaseUrl.replace(/\/+$/, '')
const collection = 'blog'
const collectionLabel = 'Blog'
const fixtureToken = Date.now().toString(36)
const fixtureTitle = `V-next live smoke ${fixtureToken}`
const uploadFilename = `vnext-live-smoke-${fixtureToken}.png`
const uploadFixturePath = resolve(tmpdir(), uploadFilename)
const results = []
let activeMcpConnection = null
let mcpRequestId = 2
let fixtureEntryUrl = null

function redact(value) {
  return String(value).replace(/[\w-]{24,}/g, '[REDACTED]')
}

async function story(id, title, run) {
  const startedAt = Date.now()
  try {
    const evidence = await run()
    results.push({
      id,
      title,
      status: 'passed',
      durationMs: Date.now() - startedAt,
      evidence: evidence ?? null,
    })
  } catch (error) {
    results.push({
      id,
      title,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: redact(error instanceof Error ? error.message : String(error)),
    })
    throw error
  }
}

async function fetchJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { response, body, text }
}

async function mcpInitialize(rawKey) {
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

function parseMcpEnvelope(text) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
  const payload = dataLines.length ? dataLines.join('\n') : text
  const envelope = JSON.parse(payload)
  if (envelope.error) {
    throw new Error(`MCP error ${envelope.error.code}: ${envelope.error.message}`)
  }
  return envelope
}

async function mcpRequest(rawKey, method, params = {}) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${rawKey}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: mcpRequestId++,
      method,
      params,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`MCP ${method} failed ${response.status}: ${redact(text).slice(0, 300)}`)
  }
  return parseMcpEnvelope(text)
}

async function mcpTool(rawKey, name, args = {}) {
  const envelope = await mcpRequest(rawKey, 'tools/call', {
    name,
    arguments: args,
  })
  return envelope.result?.structuredContent
}

async function signIn(page, redirect = '/studio/settings') {
  await page.goto(`${baseUrl}/studio/auth/signin?redirect=${encodeURIComponent(redirect)}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
    timeout: 30000,
  })
  await page.getByTestId('cms-auth-email').fill(email)
  await page.getByTestId('cms-auth-password').fill(password)
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/sign-in/email'),
    { timeout: 30000 },
  )
  await page.getByTestId('cms-auth-submit').click()
  const response = await responsePromise
  if (!response.ok()) throw new Error(`sign-in failed with ${response.status()}`)
  await page.waitForFunction((expectedPath) => location.pathname === expectedPath, redirect, {
    timeout: 30000,
  })
}

async function expectText(page, text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout })
}

async function revokeActiveMcpConnection(page, rawKey) {
  if (!activeMcpConnection || activeMcpConnection.revoked) return null
  await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
  const row = page
    .getByText(activeMcpConnection.label)
    .locator('xpath=ancestor::*[self::tr or self::li or self::div][.//button][1]')
  await row
    .getByRole('button', { name: /revoke/i })
    .first()
    .click()
  await page.getByText('MCP connection revoked.').waitFor({ timeout: 30000 })
  activeMcpConnection.revoked = true
  const revoked = await mcpInitialize(rawKey)
  if (revoked.status !== 401) throw new Error(`revoked MCP key returned ${revoked.status}`)
  return revoked.status
}

function summarizePublicEntries(body) {
  const entries =
    body && typeof body === 'object' && Array.isArray(body.entries) ? body.entries : []
  return {
    count: entries.length,
    firstPath: entries[0]?.route?.path ?? entries[0]?.path ?? null,
    firstTitle: entries[0]?.title ?? entries[0]?.data?.title ?? null,
  }
}

function assertNoDraftProjection(label, value) {
  const raw = JSON.stringify(value)
  if (raw.includes('draftData') || raw.includes('draftVersionId')) {
    throw new Error(`${label} exposed draft-only fields`)
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()

await writeFile(
  uploadFixturePath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=',
    'base64',
  ),
)

try {
  await story(
    'auth.signed-out-protected-route',
    'Signed-out users cannot access Studio settings',
    async () => {
      const response = await fetch(`${baseUrl}/studio/settings`, { redirect: 'manual' })
      const location = response.headers.get('location') ?? ''
      if (![200, 302, 307, 308].includes(response.status)) {
        throw new Error(`unexpected status ${response.status}`)
      }
      if (response.status !== 200 && !location.includes('/studio/auth/signin')) {
        throw new Error(`redirect did not target sign-in: ${location}`)
      }
      if (response.status === 200) {
        const protectedPage = await context.newPage()
        try {
          await protectedPage.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
          await protectedPage
            .locator('[data-testid="cms-auth-form"][data-auth-ready="true"]')
            .waitFor({ timeout: 30000 })
          if (!protectedPage.url().includes('/studio/auth/signin')) {
            throw new Error(`protected route did not redirect to sign-in: ${protectedPage.url()}`)
          }
        } finally {
          await protectedPage.close()
        }
      }
      return { status: response.status, location }
    },
  )

  await story(
    'auth.invalid-credentials',
    'Invalid credentials show a sign-in failure',
    async () => {
      const invalidPage = await context.newPage()
      try {
        await invalidPage.goto(`${baseUrl}/studio/auth/signin?redirect=/studio/settings`, {
          waitUntil: 'domcontentloaded',
        })
        await invalidPage.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
          timeout: 30000,
        })
        await invalidPage.getByTestId('cms-auth-email').fill(email)
        await invalidPage.getByTestId('cms-auth-password').fill(`${password}-wrong`)
        const responsePromise = invalidPage
          .waitForResponse((response) => response.url().includes('/api/auth/sign-in/email'), {
            timeout: 30000,
          })
          .catch(() => null)
        await invalidPage.getByTestId('cms-auth-submit').click()
        const response = await responsePromise
        const errorVisible = await invalidPage
          .getByTestId('cms-auth-error')
          .isVisible()
          .catch(() => false)
        if (!response) throw new Error('sign-in response was not observed')
        if (response.ok()) throw new Error('invalid credentials unexpectedly succeeded')
        if (!errorVisible) throw new Error('invalid credentials did not show form error')
        if (!invalidPage.url().includes('/studio/auth/signin')) {
          throw new Error(`invalid credentials left sign-in page: ${invalidPage.url()}`)
        }
        return { status: response.status() }
      } finally {
        await invalidPage.close()
      }
    },
  )

  await story(
    'auth.sign-in-redirect',
    'Valid sign-in redirects to requested Studio route',
    async () => {
      await signIn(page, '/studio/settings')
      await expectText(page, 'Settings')
      return { url: page.url() }
    },
  )

  await story(
    'content.fixture-publish',
    'Creates and publishes an isolated smoke entry',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}/new`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByRole('textbox', { name: 'Title *' }).waitFor({ timeout: 30000 })
      await page.getByRole('textbox', { name: 'Title *' }).fill(fixtureTitle)
      await page
        .getByRole('textbox', { name: 'Description' })
        .fill('Automated V-next release-candidate verification entry.')

      const createDraftButtons = page.getByRole('button', { name: 'Create draft' })
      if ((await createDraftButtons.count()) < 1) throw new Error('Create draft action is missing')
      await createDraftButtons.first().click()
      await page.waitForURL(new RegExp(`/studio/content/${collection}/[^/]+$`), { timeout: 30000 })
      fixtureEntryUrl = page.url()
      await page.getByText('Saved', { exact: true }).waitFor({ timeout: 30000 })

      await page.getByRole('button', { name: 'Preview website changes' }).click()
      await page.getByRole('heading', { name: 'What will change on the website' }).waitFor({
        timeout: 30000,
      })
      await page.getByRole('button', { name: 'Publish EN' }).click()
      const publishDialog = page.getByRole('dialog', { name: 'Publish?' })
      await publishDialog.waitFor({ timeout: 30000 })
      await publishDialog.getByRole('button', { name: 'Publish', exact: true }).click()
      await page.getByText('published', { exact: true }).waitFor({ timeout: 30000 })

      return { url: fixtureEntryUrl, title: fixtureTitle }
    },
  )

  const routes = [
    ['studio-home', '/studio/', 'Ginko CMS Studio'],
    ['studio-blog', `/studio/content/${collection}`, collectionLabel],
    ['studio-assets', '/studio/assets', 'Media'],
    ['studio-model', '/studio/model', 'Content setup'],
    ['studio-activity', '/studio/activity', 'Activity log'],
    ['studio-agents', '/studio/agents', 'AI work sessions'],
    ['studio-reviews', '/studio/reviews', 'Approvals'],
    ['studio-imports', '/studio/imports', 'Content imports'],
    ['studio-site-data', '/studio/site-data', 'Site-wide content'],
    ['studio-settings', '/studio/settings', 'Settings'],
  ]

  for (const [id, route, expected] of routes) {
    await story(`nav.${id}`, `Studio deep link loads ${route}`, async () => {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, expected, 60000)
      return { url: page.url(), expected }
    })
  }

  await story(
    'content-model.contract-readonly',
    'Content model shows code-defined read-only collection contracts',
    async () => {
      await page.goto(`${baseUrl}/studio/model`, { waitUntil: 'domcontentloaded' })
      await expectText(page, 'Content setup', 60000)
      const bodyText = await page.locator('body').textContent({ timeout: 30000 })
      for (const expected of ['Managed by developers', 'Content type details', 'fields']) {
        if (!bodyText.includes(expected)) {
          throw new Error(`content model did not show ${expected}`)
        }
      }
      for (const forbidden of ['Create collection', 'Add field', 'Save schema']) {
        if (bodyText.includes(forbidden)) {
          throw new Error(`content model exposed schema mutation control: ${forbidden}`)
        }
      }
      return { readonly: true }
    },
  )

  await story('site-data.view', 'Permitted user can view site data', async () => {
    await page.goto(`${baseUrl}/studio/site-data`, { waitUntil: 'domcontentloaded' })
    await expectText(page, 'Site-wide content', 60000)
    const bodyText = await page.locator('body').textContent({ timeout: 30000 })
    if (!bodyText.includes('No site-wide sections') && !bodyText.includes('New section')) {
      throw new Error('site-wide content page did not show its list or empty state')
    }
    return { url: page.url() }
  })

  await story(
    'nav.command-palette-assets',
    'Command palette opens and navigates to Media',
    async () => {
      await page.goto(`${baseUrl}/studio/`, { waitUntil: 'domcontentloaded' })
      await expectText(page, 'Ginko CMS Studio', 60000)
      await page
        .getByRole('button', { name: /Search|⌘\s*K/i })
        .first()
        .click()
      await page.getByPlaceholder('Search content or Studio pages').waitFor({ timeout: 30000 })
      const assetsSubtitle = page.getByText('Find and manage website assets')
      await assetsSubtitle.waitFor({ timeout: 30000 })
      await assetsSubtitle.evaluate((element) => {
        const option = element.closest('[role="option"]')
        if (!(option instanceof HTMLElement)) {
          throw new TypeError('Media command option was not found.')
        }
        option.click()
      })
      await page.waitForURL(/\/studio\/assets$/, { timeout: 30000 })
      await expectText(page, 'Media')
      return { url: page.url() }
    },
  )

  await story(
    'content.entry-list-state',
    'Entry list shows content status and locale state',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, collectionLabel, 60000)
      await page.getByPlaceholder('Search title, slug, or path').waitFor({ timeout: 30000 })
      const rows = page.getByTestId('cms-entry-row')
      const rowCount = await rows.count()
      if (rowCount < 1) throw new Error(`${collection} entry list rendered no rows`)
      const fixtureRow = rows.filter({ hasText: fixtureTitle })
      if ((await fixtureRow.count()) !== 1) throw new Error('published fixture row is missing')
      const rowText = await fixtureRow.textContent()
      if (!/\b(?:Live|Draft only|Needs attention|Data-only|Archived)\b/.test(rowText)) {
        throw new Error(`entry row did not expose public state: ${redact(rowText)}`)
      }
      if (!/[A-Z]{2}\s*·\s*(?:Live|Draft)/.test(rowText)) {
        throw new Error(`entry row did not expose locale readiness: ${redact(rowText)}`)
      }
      return { url: page.url(), rows: rowCount }
    },
  )

  await story(
    'content.entry-list-search-filter',
    'Entry list can filter entries by supported fields',
    async () => {
      await page.goto(`${baseUrl}/studio/content/${collection}`, { waitUntil: 'domcontentloaded' })
      await expectText(page, collectionLabel, 60000)
      const search = page.getByPlaceholder('Search title, slug, or path')
      await search.waitFor({ timeout: 30000 })
      const rows = page.getByTestId('cms-entry-row')
      const before = await rows.count()
      if (before < 1) throw new Error(`entry list had no rows for filter proof: ${before}`)
      await search.fill(fixtureToken)
      await page.waitForFunction(
        (expectedTitle) => {
          const renderedRows = document.querySelectorAll('[data-testid="cms-entry-row"]')
          return renderedRows.length === 1 && renderedRows[0]?.textContent?.includes(expectedTitle)
        },
        fixtureTitle,
        { timeout: 30000 },
      )
      const after = await rows.count()
      const filteredText = await rows.first().textContent()
      if (!filteredText.includes(fixtureTitle)) {
        throw new Error(`filtered row did not match expected content: ${redact(filteredText)}`)
      }
      return { before, after, query: fixtureToken }
    },
  )

  await story(
    'content.entry-editor-state',
    'Entry editor shows draft/publish workflow state',
    async () => {
      if (!fixtureEntryUrl) throw new Error('fixture entry URL is unavailable')
      await page.goto(fixtureEntryUrl, { waitUntil: 'domcontentloaded' })
      await expectText(page, fixtureTitle)
      const hasPublish = await page
        .getByRole('button', { name: /publish/i })
        .first()
        .isVisible()
        .catch(() => false)
      const hasSaveDraft = await page
        .getByRole('button', { name: /save draft/i })
        .first()
        .isVisible()
        .catch(() => false)
      if (!hasPublish && !hasSaveDraft)
        throw new Error('entry editor did not expose publish or save draft controls')
      return { url: page.url(), hasPublish, hasSaveDraft }
    },
  )

  await story('assets.upload-and-trash', 'Uploads and retires a smoke image', async () => {
    await page.goto(`${baseUrl}/studio/assets`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Media' }).waitFor({ timeout: 30000 })
    const uploadInput = page.locator('input[type="file"]')
    if ((await uploadInput.count()) !== 1) throw new Error('Media upload input is missing')
    await uploadInput.setInputFiles(uploadFixturePath)
    const uploadedAsset = page.getByText(uploadFilename, { exact: true })
    await uploadedAsset.first().waitFor({ timeout: 30000 })
    await uploadedAsset.first().click()

    const trashButton = page.getByRole('button', { name: 'Move to Trash' })
    await trashButton.first().waitFor({ timeout: 30000 })
    await trashButton.first().click()
    const trashDialog = page.getByRole('dialog', { name: 'Move asset to trash?' })
    await trashDialog.waitFor({ timeout: 30000 })
    await trashDialog.getByRole('button', { name: 'Move to trash' }).click()
    await page
      .getByText(uploadFilename, { exact: true })
      .waitFor({ state: 'hidden', timeout: 30000 })

    return { filename: uploadFilename, retired: true }
  })

  await story('public-api.list', 'Public API lists only published entries', async () => {
    const { response, body, text } = await fetchJson(
      `/api/ginko/v1/list?collection=${collection}&locale=en&limit=2`,
    )
    if (!response.ok)
      throw new Error(`public list failed ${response.status}: ${redact(text).slice(0, 300)}`)
    const summary = summarizePublicEntries(body)
    if (summary.count < 1) throw new Error('public list returned no entries')
    assertNoDraftProjection('public list', body)
    return summary
  })

  await story('public-api.nav', 'Public API navigation returns published routes only', async () => {
    const { response, body, text } = await fetchJson(
      `/api/ginko/v1/nav?collection=${collection}&locale=en`,
    )
    if (!response.ok)
      throw new Error(`public nav failed ${response.status}: ${redact(text).slice(0, 300)}`)
    if (!Array.isArray(body?.tree) || body.tree.length < 1) {
      throw new Error('public nav returned no tree entries')
    }
    assertNoDraftProjection('public nav', body)
    const firstRoute = body.tree[0]?.entry?.route?.path ?? null
    if (!firstRoute) throw new Error('public nav entry did not include a route path')
    return { count: body.tree.length, firstRoute }
  })

  await story('public-api.search', 'Public API search returns published results only', async () => {
    const { response, body, text } = await fetchJson(
      `/api/ginko/v1/search?collection=${collection}&locale=en&query=${fixtureToken}&limit=2`,
    )
    if (!response.ok)
      throw new Error(`public search failed ${response.status}: ${redact(text).slice(0, 300)}`)
    if (!Array.isArray(body?.results) || body.results.length < 1) {
      throw new Error('public search returned no results')
    }
    assertNoDraftProjection('public search', body)
    return { count: body.results.length, firstPath: body.results[0]?.route?.path ?? null }
  })

  await story('public-api.sitemap', 'Public API sitemap returns published URLs only', async () => {
    const { response, body, text } = await fetchJson(
      `/api/ginko/v1/sitemap?collection=${collection}&locale=en&limit=5`,
    )
    if (!response.ok)
      throw new Error(`public sitemap failed ${response.status}: ${redact(text).slice(0, 300)}`)
    if (!Array.isArray(body?.urls) || body.urls.length < 1) {
      throw new Error('public sitemap returned no URLs')
    }
    assertNoDraftProjection('public sitemap', body)
    const firstRoute = body.urls[0]?.route?.path ?? null
    if (!firstRoute) throw new Error('public sitemap entry did not include a route path')
    return { count: body.urls.length, firstRoute, hasNextPage: body.pageInfo?.hasNextPage === true }
  })

  await story(
    'public-api.search-validation',
    'Public API validates invalid search input',
    async () => {
      const { response, body } = await fetchJson(
        `/api/ginko/v1/search?collection=${collection}&locale=en`,
      )
      if (response.status !== 400)
        throw new Error(`missing search query returned ${response.status}`)
      return { status: response.status, code: body?.data?.code ?? body?.code ?? null }
    },
  )

  await story(
    'mcp.unauthenticated-rejected',
    'Unauthenticated MCP initialize is rejected',
    async () => {
      const response = await mcpInitialize('')
      if (response.status !== 401)
        throw new Error(`unauthenticated MCP returned ${response.status}`)
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
    const response = await mcpInitialize('not-a-valid-ginko-cms-story-key')
    const text = await response.text()
    if (response.status !== 401) throw new Error(`unknown MCP key returned ${response.status}`)
    if (text.includes('not-a-valid-ginko-cms-story-key')) {
      throw new Error('unknown MCP key was reflected in failure output')
    }
    return { status: response.status }
  })

  await story(
    'mcp.create-authenticated',
    'MCP connection can be created and used for initialize',
    async () => {
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
      const label = `Story ${Date.now().toString().slice(-5)}`
      await page.locator('input[placeholder="Preview client"]').fill(label)
      const createResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/auth/api-key/create'),
        { timeout: 30000 },
      )
      await page.getByRole('button', { name: 'Create MCP connection' }).click()
      const createResponse = await createResponsePromise
      const createBody = await createResponse.json().catch(() => null)
      if (!createResponse.ok()) {
        throw new Error(
          `API key create failed ${createResponse.status()}: ${redact(JSON.stringify(createBody))}`,
        )
      }
      const rawKey = createBody?.key ?? createBody?.data?.key
      const keyId = createBody?.id ?? createBody?.data?.id
      if (!rawKey || !keyId) throw new Error('API key create response did not include key/id')
      activeMcpConnection = { label, rawKey, keyId, revoked: false }
      await page.getByText('MCP connection created.').waitFor({ timeout: 30000 })
      await page.getByText(label).waitFor({ timeout: 30000 })
      await page.getByText(rawKey, { exact: true }).waitFor({ timeout: 30000 })

      const auth = await mcpInitialize(rawKey)
      const authText = await auth.text()
      if (!auth.ok || !authText.includes('protocolVersion')) {
        throw new Error(
          `authenticated MCP initialize failed ${auth.status}: ${redact(authText).slice(0, 300)}`,
        )
      }

      return {
        apiKeyIdLength: keyId.length,
        authenticatedStatus: auth.status,
      }
    },
  )

  await story(
    'mcp.raw-key-one-time-visible',
    'Raw MCP key is only visible at creation time',
    async () => {
      if (!activeMcpConnection?.rawKey) throw new Error('MCP connection was not created')
      const rawKey = activeMcpConnection.rawKey
      const visibleAtCreation = await page
        .getByText(rawKey, { exact: true })
        .isVisible()
        .catch(() => false)
      if (!visibleAtCreation) throw new Error('raw MCP key was not visible immediately at creation')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'MCP connections' }).waitFor({ timeout: 30000 })
      await page.getByText(activeMcpConnection.label).waitFor({ timeout: 30000 })
      const visibleAfterReload = await page
        .getByText(rawKey, { exact: true })
        .isVisible()
        .catch(() => false)
      if (visibleAfterReload) throw new Error('raw MCP key remained visible after settings reload')
      return { visibleAtCreation, visibleAfterReload }
    },
  )

  await story('mcp.tools-list-and-read', 'MCP tools list and read published CMS data', async () => {
    if (!activeMcpConnection?.rawKey) throw new Error('MCP connection was not created')
    const rawKey = activeMcpConnection.rawKey
    const toolsEnvelope = await mcpRequest(rawKey, 'tools/list')
    const tools = toolsEnvelope.result?.tools
    if (!Array.isArray(tools)) throw new Error('tools/list did not return a tool array')
    const toolNames = tools.map((tool) => tool.name)
    for (const name of [
      'list-collections',
      'get-collection',
      'list-entries',
      'get-entry',
      'list',
      'search',
    ]) {
      if (!toolNames.includes(name)) throw new Error(`tools/list missing ${name}`)
    }

    const collections = await mcpTool(rawKey, 'list-collections')
    const collectionList = collections?.collections
    if (
      !Array.isArray(collectionList) ||
      !collectionList.some((item) => item.slug === collection)
    ) {
      throw new Error(`list-collections did not include ${collection}`)
    }

    const collectionResult = await mcpTool(rawKey, 'get-collection', {
      slug: collection,
      compact: true,
    })
    if (collectionResult?.slug !== collection || collectionResult?.routing?.mode !== 'route') {
      throw new Error(`get-collection did not return compact ${collection} route metadata`)
    }

    const cmsEntries = await mcpTool(rawKey, 'list-entries', {
      collection,
      locale: 'en',
    })
    const editableEntries = cmsEntries?.entries
    if (!Array.isArray(editableEntries) || editableEntries.length < 1) {
      throw new Error('list-entries did not return CMS entries')
    }
    const entryId = editableEntries[0]?._id ?? editableEntries[0]?.id
    if (!entryId) throw new Error('list-entries did not return an entry id')

    const cmsEntry = await mcpTool(rawKey, 'get-entry', {
      entryId,
      locale: 'en',
      compact: true,
    })
    if (cmsEntry?.collection !== collection || cmsEntry?.entryId !== entryId) {
      throw new Error('get-entry did not return the requested compact CMS entry')
    }

    const publicList = await mcpTool(rawKey, 'list', {
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

    const search = await mcpTool(rawKey, 'search', {
      collection,
      locale: 'en',
      query: fixtureToken,
      limit: 2,
      compact: true,
    })
    if (!Array.isArray(search?.results) || search.results.length < 1) {
      throw new Error('public search tool returned no compact results')
    }
    return {
      toolCount: tools.length,
      collectionCount: collectionList.length,
      cmsEntryCount: editableEntries.length,
      firstPublicPath: firstEntry.route.path,
      searchResults: search.results.length,
    }
  })

  await story('mcp.revoke', 'MCP connection can be revoked', async () => {
    if (!activeMcpConnection?.rawKey) throw new Error('MCP connection was not created')
    const revokedStatus = await revokeActiveMcpConnection(page, activeMcpConnection.rawKey)
    return { revokedStatus }
  })

  await story('content.fixture-cleanup', 'Unpublishes and archives the smoke entry', async () => {
    if (!fixtureEntryUrl) throw new Error('fixture entry URL is unavailable')
    await page.goto(fixtureEntryUrl, { waitUntil: 'domcontentloaded' })
    await page.getByText(fixtureTitle, { exact: true }).first().waitFor({ timeout: 30000 })

    const entryActions = page.getByRole('button', { name: `Entry actions for ${fixtureTitle}` })
    await entryActions.click()
    const unpublish = page.getByRole('menuitem', { name: 'Unpublish' })
    if ((await unpublish.count()) === 1) {
      await unpublish.click()
      const dialog = page.getByRole('dialog', { name: 'Unpublish' })
      await dialog.waitFor({ timeout: 30000 })
      await dialog.getByRole('button', { name: 'Unpublish' }).click()
      await page.getByText('draft', { exact: true }).waitFor({ timeout: 30000 })
    }

    await entryActions.click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    const archiveDialog = page.getByRole('dialog', { name: 'Archive' })
    await archiveDialog.waitFor({ timeout: 30000 })
    await archiveDialog.getByRole('button', { name: 'Archive' }).click()
    await page.waitForURL(new RegExp(`/studio/content/${collection}/?$`), { timeout: 30000 })
    return { archived: true }
  })

  await story(
    'auth.sign-out-protected-access-lost',
    'Signed-in users can sign out and lose Studio access',
    async () => {
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 30000 })
      const userMenu = page.locator('button').filter({ hasText: email })
      const userMenuCount = await userMenu.count()
      if (userMenuCount !== 1) throw new Error(`expected one user menu, found ${userMenuCount}`)
      await userMenu.click()
      const signOutItem = page.getByText('Sign out', { exact: true })
      const signOutCount = await signOutItem.count()
      if (signOutCount !== 1) throw new Error(`expected one sign-out item, found ${signOutCount}`)
      await signOutItem.click()
      await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
        timeout: 30000,
      })
      if (!page.url().includes('/studio/auth/signin')) {
        throw new Error(`sign-out did not return to sign-in: ${page.url()}`)
      }
      await page.goto(`${baseUrl}/studio/settings`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="cms-auth-form"][data-auth-ready="true"]').waitFor({
        timeout: 30000,
      })
      if (!page.url().includes('/studio/auth/signin')) {
        throw new Error(`protected route remained accessible after sign-out: ${page.url()}`)
      }
      return { url: page.url() }
    },
  )
} finally {
  if (activeMcpConnection && !activeMcpConnection.revoked) {
    await revokeActiveMcpConnection(page, activeMcpConnection.rawKey).catch((error) => {
      results.push({
        id: 'mcp.cleanup',
        title: 'Cleanup active MCP connection after failure',
        status: 'failed',
        durationMs: 0,
        error: redact(error instanceof Error ? error.message : String(error)),
      })
    })
  }
  await browser.close()
  await unlink(uploadFixturePath).catch(() => undefined)
  if (outputPath) {
    const failed = results.filter((result) => result.status !== 'passed')
    await writeFile(
      outputPath,
      `${JSON.stringify({ ok: failed.length === 0, baseUrl, stories: results.length, results }, null, 2)}\n`,
    )
  }
}

const failed = results.filter((result) => result.status !== 'passed')
if (failed.length) {
  console.error(JSON.stringify({ ok: false, baseUrl, results }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, baseUrl, stories: results.length, results }, null, 2))
