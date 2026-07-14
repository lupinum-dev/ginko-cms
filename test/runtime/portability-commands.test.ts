import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { afterEach, describe, expect, it } from 'vitest'

import { exportPortablePublishedContent } from '../../packages/cms/src/portability/commands.js'

const functionName = Symbol.for('functionName')
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
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
  return { contract, document }
}

function pathOf(reference: unknown) {
  return String((reference as Record<symbol, unknown>)[functionName])
}

describe('published portability export orchestration', () => {
  it('writes and verifies a bounded immutable directory before completing the run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-export-'))
    temporaryDirectories.push(root)
    const output = join(root, 'portable')
    const { contract, document } = fixture()
    const documentSha256 = await hashCanonicalJson(document)
    const calls: Array<{ path: string; args: Record<string, unknown> }> = []
    const client = {
      mutation: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ path, args })
        if (path.endsWith(':createExportRun')) return { leaseGeneration: 7 }
        if (path.endsWith(':captureExportPage')) return { captured: 1, complete: true }
        if (path.endsWith(':sealExportRun')) return { documentCount: 1, assetCount: 0 }
        if (path.endsWith(':completeExportRun')) return { state: 'complete' }
        if (path.endsWith(':abortExportRun')) return { state: 'aborted' }
        throw new Error(`Unexpected mutation ${path}`)
      },
      query: async (reference: unknown, args: Record<string, unknown>) => {
        const path = pathOf(reference)
        calls.push({ path, args })
        if (path.endsWith(':readExportDocuments')) {
          expect(args.limit).toBe(100)
          return { documents: [{ document, documentSha256 }], cursor: null }
        }
        if (path.endsWith(':readExportAssets')) {
          expect(args.limit).toBe(100)
          return { assets: [], cursor: null }
        }
        throw new Error(`Unexpected query ${path}`)
      },
      action: async () => {
        throw new Error('Published export does not use actions.')
      },
    }

    const result = await exportPortablePublishedContent(client as never, output, {
      deploymentId: 'deployment-1',
      collections: ['posts'],
      contract,
      runId: 'run-1',
      assetTransfer: {
        cmsOrigin: 'https://cms.example.test',
        sessionCookie: 'better-auth.session_token=test-session-token',
      },
    })

    expect(result).toMatchObject({ runId: 'run-1', documentCount: 1, assetCount: 0 })
    expect(JSON.parse(readFileSync(join(output, '.ginko/portable.json'), 'utf8'))).toMatchObject({
      format: 'ginko-content-portable',
      version: 1,
    })
    const completion = calls.find((call) => call.path.endsWith(':completeExportRun'))
    expect(completion?.args).toMatchObject({
      runId: 'run-1',
      documentCount: 1,
      assetCount: 0,
      manifestSha256: result.manifestSha256,
    })
    expect(calls.some((call) => call.path.endsWith(':abortExportRun'))).toBe(false)
  })

  it('aborts a restart-only run when local verification cannot complete', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-export-failure-'))
    temporaryDirectories.push(root)
    const { contract, document } = fixture()
    const calls: string[] = []
    const client = {
      mutation: async (reference: unknown) => {
        const path = pathOf(reference)
        calls.push(path)
        if (path.endsWith(':createExportRun')) return { leaseGeneration: 1 }
        if (path.endsWith(':captureExportPage')) return { captured: 1, complete: true }
        if (path.endsWith(':sealExportRun')) return { documentCount: 1, assetCount: 0 }
        if (path.endsWith(':abortExportRun')) return { state: 'aborted' }
        throw new Error(`Unexpected mutation ${path}`)
      },
      query: async (reference: unknown) => {
        const path = pathOf(reference)
        if (path.endsWith(':readExportDocuments')) {
          return { documents: [{ document, documentSha256: '0'.repeat(64) }], cursor: null }
        }
        if (path.endsWith(':readExportAssets')) return { assets: [], cursor: null }
        throw new Error(`Unexpected query ${path}`)
      },
      action: async () => null,
    }

    await expect(
      exportPortablePublishedContent(client as never, join(root, 'portable'), {
        deploymentId: 'deployment-1',
        collections: ['posts'],
        contract,
        runId: 'run-failure',
        assetTransfer: {
          cmsOrigin: 'https://cms.example.test',
          sessionCookie: 'better-auth.session_token=test-session-token',
        },
      }),
    ).rejects.toThrow(/could not be written safely/i)
    expect(calls.at(-1)).toMatch(/:abortExportRun$/)
  })
})
