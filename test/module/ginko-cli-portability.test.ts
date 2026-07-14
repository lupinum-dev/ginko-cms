import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { writePortableDirectory } from '@lupinum/ginko-content/portability/node'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'

const functionName = Symbol.for('functionName')
const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function output() {
  let value = ''
  return {
    stream: { write: (chunk: string | Uint8Array) => void (value += String(chunk)) },
    read: () => value,
  }
}

function pathOf(reference: unknown) {
  return String((reference as Record<symbol, unknown>)[functionName])
}

describe('ginko-cms content operator CLI', () => {
  it('exports, verifies, plans, and explicitly applies through one operator session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-content-cli-'))
    temporaryDirectories.push(root)
    writeFileSync(
      resolve(root, 'content.config.ts'),
      `export default { collections: { posts: { type: 'page', source: 'content/posts/**/*.md', route: '/posts', fields: { title: { type: 'text', required: true } } } } }\n`,
      'utf8',
    )
    writeFileSync(resolve(root, 'nuxt.config.ts'), `export default { content: {} }\n`, 'utf8')
    writeFileSync(
      resolve(root, '.env.local'),
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_SITE_URL=https://example.convex.site',
        'CONVEX_DEPLOYMENT=dev:example',
        'SITE_URL=https://cms.example.test',
        'GINKO_CMS_SESSION_COOKIE=better-auth.session_token=test-session-token',
        '',
      ].join('\n'),
      'utf8',
    )
    const contract = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/posts',
            fields: { title: { type: 'text', required: true } },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const document: PortableDocumentV1 = {
      format: 'ginko-content-document',
      version: 1,
      collection: 'posts',
      canonicalKey: 'hello-world',
      locale: 'en',
      slug: 'hello-world',
      parentCanonicalKey: null,
      order: null,
      shared: { title: 'Hello world' },
      localized: {},
      body: { kind: 'mdc', source: '# Hello world\n' },
      visibility: { navigation: true, search: true, sitemap: true },
    }
    const documentSha256 = await hashCanonicalJson(document)
    const source = resolve(root, 'source')
    await writePortableDirectory(source, { contract, documents: [document], assets: [] })

    const calls: Array<{ kind: string; path?: string; args?: Record<string, unknown> }> = []
    const client = {
      setAuth: (token: string) => calls.push({ kind: 'auth', args: { token } }),
      query: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'query', path, args })
        if (path.endsWith(':readExportDocuments')) {
          return { documents: [{ document, documentSha256 }], cursor: null }
        }
        if (path.endsWith(':readExportAssets')) return { assets: [], cursor: null }
        if (path.endsWith(':inspectPortableDrafts')) {
          return (args.items as Array<{ itemKey: string }>).map(({ itemKey }) => ({
            itemKey,
            currentDraftSha256: null,
          }))
        }
        throw new Error(`Unexpected query ${path}`)
      },
      mutation: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'mutation', path, args })
        if (path.endsWith(':createExportRun')) return { leaseGeneration: 1 }
        if (path.endsWith(':captureExportPage')) return { captured: 1, complete: true }
        if (path.endsWith(':sealExportRun')) return { documentCount: 1, assetCount: 0 }
        if (path.endsWith(':completeExportRun')) return { state: 'complete' }
        if (path.endsWith(':createImportPlan')) return null
        if (path.endsWith(':appendImportPlanItems')) return null
        if (path.endsWith(':appendImportPlanAssets')) return null
        if (path.endsWith(':beginImportApply')) return { state: 'applying' }
        if (path.endsWith(':applyImportItem')) return { status: 'committed' }
        if (path.endsWith(':beginImportVerification')) return { state: 'verifying' }
        if (path.endsWith(':finalizeImport')) return { state: 'complete' }
        if (path.endsWith(':abortExportRun')) return { state: 'aborted' }
        throw new Error(`Unexpected mutation ${path}`)
      },
      action: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ kind: 'action', path, args })
        if (path.endsWith(':sealImportPlan')) return { runId: 'import-run-1' }
        throw new Error(`Unexpected action ${path}`)
      },
    }
    const tokenExchange = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: 'operator-convex-jwt' }), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', tokenExchange)

    const run = async (args: string[]) => {
      const stdout = output()
      const stderr = output()
      const code = await runGinkoCmsCli(args, {
        cwd: root,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        convexClientFactory: () => client as never,
      })
      return { code, stdout: stdout.read(), stderr: stderr.read() }
    }

    const exported = resolve(root, 'exported')
    const exportResult = await run(['content', 'export', '--out', exported])
    expect(exportResult).toMatchObject({ code: 0, stderr: '' })
    expect(exportResult.stdout).toContain('scope=posts, published=1')
    expect(readFileSync(resolve(exported, '.ginko/portable.json'), 'utf8')).toContain(
      'ginko-content-portable',
    )

    const verifyResult = await run(['content', 'verify', exported])
    expect(verifyResult).toMatchObject({ code: 0, stderr: '' })
    expect(verifyResult.stdout).toContain('documents=1')

    const planFile = resolve(root, 'import-plan.json')
    const planResult = await run(['content', 'import', source, '--plan', planFile])
    expect(planResult).toMatchObject({ code: 0, stderr: '' })
    expect(planResult.stdout).toContain('scope=posts, create=1')
    expect(planResult.stdout).toContain('blockers=0')
    expect(JSON.parse(readFileSync(planFile, 'utf8'))).toMatchObject({
      runId: 'import-run-1',
      directory: source,
    })

    const applyResult = await run(['content', 'import', '--apply', planFile])
    expect(applyResult).toMatchObject({ code: 0, stderr: '' })
    expect(applyResult.stdout).toContain('Import complete')

    const tampered = JSON.parse(readFileSync(planFile, 'utf8')) as {
      payload: { deploymentId: string }
    }
    tampered.payload.deploymentId = 'prod:other'
    writeFileSync(planFile, JSON.stringify(tampered), 'utf8')
    const callsBeforeTamperedApply = calls.length
    const rejected = await run(['content', 'import', '--apply', planFile])
    expect(rejected.code).toBe(2)
    expect(rejected.stderr).toMatch(/payload hash does not match/i)
    expect(calls).toHaveLength(callsBeforeTamperedApply)

    tokenExchange.mockResolvedValueOnce(new Response(null, { status: 401 }))
    const denied = await run(['content', 'export', '--out', resolve(root, 'unauthorized-export')])
    expect(denied.code).toBe(2)
    expect(denied.stderr).toMatch(/operator authentication failed with HTTP 401/i)
    expect(denied.stderr).not.toContain('test-session-token')
    expect(denied.stderr).not.toContain('better-auth.session_token')

    expect(calls.filter((call) => call.kind === 'auth').length).toBeGreaterThan(4)
    expect(tokenExchange).toHaveBeenCalledWith(
      'https://example.convex.site/api/auth/convex/token',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({
          Cookie: 'better-auth.session_token=test-session-token',
        }),
      }),
    )
  })
})
