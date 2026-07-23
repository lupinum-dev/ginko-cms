import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'

import { createGinkoMcpHandler } from '../../packages/convex/src/mcpHandler'
import { buildGinkoPublishImpactApp } from '../fixtures/mcp-publish-impact-app/build'

const resource = new URL('https://ginko.example.test/mcp')
const issuer = new URL('https://ginko.example.test/mcp-credentials/')
const bearer = 'ginko-app-bearer-sentinel'
const rawClient = 'ginko-app-raw-client-sentinel'
const secretSentinels = Object.freeze([
  bearer,
  rawClient,
  'ginko-app-cookie-sentinel',
  'ginko-app-convex-jwt-sentinel',
  'ginko-app-service-proof-sentinel',
  'ginko-app-provider-reference-sentinel',
  'ginko-app-raw-cause-sentinel',
])
const input = {
  agentRunId: 'run-1',
  entryId: 'entry-1',
  expectedVersion: 7,
  locales: ['en'],
}

function impact() {
  return {
    allowed: true,
    blockers: [],
    confirm: null,
    confirmation: null,
    effects: [
      { count: 1, kind: 'routes', summary: 'Public routes affected' },
      {
        countLabel: '2 or more',
        kind: 'changes',
        minimumCount: 2,
        summary: 'Public output changes',
      },
    ],
    summary: 'Publish About in English',
    warnings: [{ code: 'ROUTE_CHANGED', message: 'The public route will change.' }],
  }
}

function createFixture(appHtml: string) {
  let previewExecutions = 0
  const handler = createGinkoMcpHandler({
    issuer,
    publishImpactAppHtml: appHtml,
    resource,
    operations: {
      async admitCredential() {
        return {
          kind: 'access',
          access: {
            apiKeyId: 'credential-1',
            expiresAt: null,
            scopes: ['readCms', 'editEntries'],
          },
        }
      },
      async startAgentRun() {
        return { _id: 'run-1' }
      },
      async completeAgentRun() {
        return { _id: 'run-1', status: 'completed' }
      },
      async getEntry() {
        return { _id: 'entry-1' }
      },
      async saveEntryDraft() {
        return { draftVersion: 8 }
      },
      async previewPublish(args) {
        expect(args).toEqual({ apiKeyId: 'credential-1', ...input })
        previewExecutions += 1
        return impact()
      },
    },
  })
  return { handler, previewExecutions: () => previewExecutions }
}

async function protocolRequest(
  handler: ReturnType<typeof createGinkoMcpHandler>,
  method: string,
  params: Record<string, unknown>,
) {
  const name =
    typeof params.name === 'string'
      ? params.name
      : typeof params.uri === 'string'
        ? params.uri
        : undefined
  const response = await handler.fetch(
    {},
    new Request(resource, {
      body: JSON.stringify({
        id: crypto.randomUUID(),
        jsonrpc: '2.0',
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/clientCapabilities': {
              extensions: {
                'io.modelcontextprotocol/ui': {
                  mimeTypes: ['text/html;profile=mcp-app'],
                },
              },
            },
            'io.modelcontextprotocol/clientInfo': {
              name: 'ginko-app-proof',
              version: '0.0.0',
            },
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          },
        },
      }),
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
        'mcp-method': method,
        ...(name === undefined ? {} : { 'mcp-name': name }),
        'mcp-protocol-version': '2026-07-28',
      },
      method: 'POST',
    }),
  )
  const text = await response.text()
  const envelope = JSON.parse(text.startsWith('data: ') ? text.slice(6).trim() : text) as {
    error?: unknown
    result?: unknown
  }
  if (envelope.error)
    throw new Error(`MCP protocol request failed: ${JSON.stringify(envelope.error)}`)
  return { response, result: envelope.result, text }
}

function hostHtml(code: string) {
  return [
    '<!doctype html><html><head>',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'\">",
    '</head><body>',
    `<script>Object.defineProperty(window,'__GINKO_HOST_ONLY_SECRETS__',{value:Object.freeze(${JSON.stringify(secretSentinels)}),enumerable:false})</script>`,
    `<script>${code.replaceAll('</script', '<\\/script')}</script>`,
    '</body></html>',
  ].join('')
}

describe('Ginko publish-impact MCP App', () => {
  it('rejects empty and oversized App documents before serving MCP', () => {
    const base = {
      issuer,
      operations: {
        async admitCredential() {
          return { kind: 'invalid' as const }
        },
        async startAgentRun() {},
        async completeAgentRun() {},
        async getEntry() {},
        async saveEntryDraft() {},
        async previewPublish() {},
      },
      resource,
    }
    expect(() => createGinkoMcpHandler({ ...base, publishImpactAppHtml: '  ' })).toThrow(
      'must be non-empty and no larger than 512 KiB',
    )
    expect(() =>
      createGinkoMcpHandler({ ...base, publishImpactAppHtml: 'x'.repeat(512 * 1024 + 1) }),
    ).toThrow('must be non-empty and no larger than 512 KiB')
  })

  it('projects canonical impact without granting publish or review authority', async () => {
    const build = await buildGinkoPublishImpactApp()
    const fixture = createFixture(build.appHtml)
    const listed = await protocolRequest(fixture.handler, 'tools/list', {})
    expect(listed.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'preview-publish',
          _meta: {
            ui: {
              resourceUri: 'ui://ginko/publish-impact.html',
              visibility: ['model', 'app'],
            },
          },
        }),
      ]),
    })
    const resourceResult = await protocolRequest(fixture.handler, 'resources/read', {
      uri: 'ui://ginko/publish-impact.html',
    })
    expect(resourceResult.result).toMatchObject({
      contents: [
        {
          mimeType: 'text/html;profile=mcp-app',
          text: build.appHtml,
          uri: 'ui://ginko/publish-impact.html',
        },
      ],
    })
    const fallback = await protocolRequest(fixture.handler, 'tools/call', {
      arguments: input,
      name: 'preview-publish',
    })
    expect(fallback.result).toMatchObject({
      content: [
        {
          type: 'text',
          text: 'Previewed publish impact without changing public content.',
        },
      ],
      structuredContent: { preview: impact(), publicChanged: false },
    })

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    const consoleErrors: string[] = []
    const consoleMessages: string[] = []
    const consoleCaptures: Promise<void>[] = []
    const pageErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
      consoleCaptures.push(
        Promise.all(
          message.args().map(async (argument) => {
            try {
              return JSON.stringify(await argument.jsonValue())
            } catch {
              return '<unserializable>'
            }
          }),
        ).then((values) => {
          consoleMessages.push([message.type(), message.text(), ...values].join('\n'))
        }),
      )
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
      await page.route('https://ginko-app-host.invalid/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname === '/') {
          await route.fulfill({ body: hostHtml(build.hostCode), contentType: 'text/html' })
          return
        }
        if (url.pathname === '/__ginko_app_tool__') {
          const call = JSON.parse(request.postData() ?? '{}') as {
            arguments?: Record<string, unknown>
            name: string
          }
          const result = await protocolRequest(fixture.handler, 'tools/call', call)
          await route.fulfill({
            body: JSON.stringify(result.result),
            contentType: 'application/json',
          })
          return
        }
        await route.abort('blockedbyclient')
      })
      await page.goto('https://ginko-app-host.invalid/')
      await page.evaluate(async ({ html }) => window.__GINKO_APP_HOST__.mount(html, true), {
        html: build.appHtml,
      })
      const frame = page.frameLocator('iframe[data-testid="ginko-publish-impact-frame"]')
      await frame.getByTestId('publish-impact').waitFor()
      await page.evaluate(async (value) => window.__GINKO_APP_HOST__.sendInput(value), input)
      await page.evaluate(
        async (value) => window.__GINKO_APP_HOST__.sendResult(value),
        fallback.result,
      )
      await expect
        .poll(() => frame.getByTestId('summary').textContent())
        .toBe('Publish About in English')
      expect(await frame.getByTestId('allowed').textContent()).toContain('true')
      await expect
        .poll(() => frame.getByTestId('warnings').textContent())
        .toContain('ROUTE_CHANGED')
      const renderedEffects = (await frame.getByTestId('effects').textContent()).replaceAll(
        /\s+/g,
        ' ',
      )
      expect(renderedEffects).toContain('Public routes affected (1)')
      expect(renderedEffects).toContain('Public output changes (2 or more)')
      expect(await frame.getByTestId('public-changed').textContent()).toContain('false')
      expect(await frame.getByText(/approve|publish now/i).count()).toBe(0)

      await expect.poll(() => frame.getByTestId('refresh').isEnabled()).toBe(true)
      await frame.getByTestId('refresh').click()
      await expect
        .poll(() => page.evaluate(() => window.__GINKO_APP_HOST__.snapshot().toolCalls.length))
        .toBe(1)
      await expect.poll(() => frame.getByTestId('status').textContent()).toBe('ready')
      expect(fixture.previewExecutions()).toBe(2)

      await frame.getByTestId('open-studio').click()
      await expect.poll(() => frame.getByTestId('status').textContent()).toBe('denied')
      expect(await page.evaluate(() => window.__GINKO_APP_HOST__.snapshot().links)).toEqual([
        'https://ginko.example.test/studio/reviews',
      ])
      const snapshot = await page.evaluate(() => window.__GINKO_APP_HOST__.snapshot())
      expect(snapshot.toolCalls).toEqual([{ arguments: input, name: 'preview-publish' }])
      expect(snapshot.messages).not.toContain(bearer)
      expect(build.appHtml).not.toContain('request-publish-review')
      expect(build.appHtml).not.toContain('publish-entry')

      await Promise.all(consoleCaptures)
      const iframeHtml = await frame.locator('html').evaluate((element) => element.outerHTML)
      const leakSurfaces = [
        build.appHtml,
        iframeHtml,
        snapshot.messages,
        JSON.stringify(fallback.result),
        JSON.stringify(resourceResult.result),
        consoleMessages.join('\n'),
        pageErrors.join('\n'),
      ]
      for (const sentinel of secretSentinels) {
        expect(leakSurfaces.every((surface) => !surface.includes(sentinel))).toBe(true)
      }

      await page.evaluate(async () => window.__GINKO_APP_HOST__.teardown())
      expect(
        await page.evaluate(() => window.__GINKO_APP_HOST__.snapshot().teardownResponses),
      ).toBe(1)
      expect(consoleErrors).toEqual([])
      expect(pageErrors).toEqual([])
    } finally {
      await context.close()
      await browser.close()
    }
  }, 30_000)
})
