import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import {
  verifyPortableDirectoryBounded,
  writePortableDirectory,
} from '@lupinum/ginko-content/portability/node'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isLocalMigrationTarget,
  runMigrateCommand,
  stagePortableMigrationSnapshot,
} from '../../packages/cms/src/cli/migrate.js'

const previousEnvironment = { ...process.env }

afterEach(() => {
  process.env = { ...previousEnvironment }
})

function configuredRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ginko-migrate-'))
  writeFileSync(
    join(root, '.env.local'),
    [
      'CONVEX_DEPLOYMENT=local:test-migration',
      'CONVEX_URL=http://127.0.0.1:3210',
      'SITE_URL=http://127.0.0.1:3000',
    ].join('\n'),
  )
  return root
}

function evidence(root: string, entryCount = 1) {
  const directory = join(root, '.ginko/migrations')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'import-plan.json'), '{}')
  writeFileSync(
    join(directory, 'from-content.json'),
    JSON.stringify({
      format: 'ginko-cms-content-migration',
      version: 1,
      sourceRoot: '.',
      portableDirectory: '.ginko/migrations/portable',
      manifestSha256: 'a'.repeat(64),
      target: {
        selector: 'local',
        deploymentId: 'local:test-migration',
        convexUrl: 'http://127.0.0.1:3210',
        siteOrigin: 'http://127.0.0.1:3000',
        contentHash: 'b'.repeat(64),
      },
      plan: {
        planId: 'plan-1',
        runId: 'run-1',
        directory: join(root, '.ginko/migrations/portable'),
        payload: {},
        payloadSha256: 'c'.repeat(64),
        items: Array.from({ length: entryCount }, (_, index) => ({
          applyOrder: index,
          itemKey: `item-${index}`,
          inputSha256: 'f'.repeat(64),
          payload: { effect: 'create' },
          document: {},
        })),
        assets: [],
        blockers: [],
      },
      planId: 'plan-1',
      runId: 'run-1',
      payloadSha256: 'c'.repeat(64),
      counts: {
        documents: entryCount * 2,
        assets: 0,
        collections: 1,
        locales: 2,
        create: 2,
        update: 0,
        skip: 0,
      },
      publication: {
        sha256: 'd'.repeat(64),
        entries: Array.from({ length: entryCount }, (_, index) => ({
          entryId: `entry-${String(index + 1).padStart(3, '0')}`,
          locales: ['de', 'en'],
          pendingLocales: ['de', 'en'],
          expectedVersion: 3,
          draftSha256: 'e'.repeat(64),
        })),
      },
    }),
  )
}

function client(
  options: { draftSha256?: string; pendingLocales?: string[]; entryCount?: number } = {},
) {
  const calls: string[] = []
  const entryCount = options.entryCount ?? 1
  const identities = Array.from({ length: entryCount }, (_, index) => ({
    entryId: `entry-${String(index + 1).padStart(3, '0')}`,
    collection: 'pages',
    canonicalKey: `page-${index + 1}`,
    locale: 'en',
  }))
  return {
    calls,
    factory: () => ({
      setAuth: () => {},
      query: async (reference: unknown, args: Record<string, unknown>) => {
        const path = String((reference as Record<symbol, unknown>)[Symbol.for('functionName')])
        calls.push(path)
        if (path.endsWith('members:getAccessContext')) {
          return { role: 'owner', can: { 'cms.portability.manage': true } }
        }
        if (path.endsWith('portability:listImportPublicationIdentities')) {
          const cursor = args.cursor as number | null
          const start = cursor === null ? 0 : cursor + 1
          const page = identities.slice(start, start + 100)
          return {
            identities: page,
            cursor: start + page.length < identities.length ? start + page.length - 1 : null,
          }
        }
        if (path.endsWith('portability:inspectImportPublicationEntries')) {
          for (const entry of args.entries as Array<Record<string, unknown>>) {
            expect(entry).not.toHaveProperty('locale')
          }
          return {
            entries: (args.entries as Array<{ entryId: string }>).map(({ entryId }) => ({
              entryId,
              locales: ['de', 'en'],
              pendingLocales: options.pendingLocales ?? ['de', 'en'],
              expectedVersion: 3,
              draftSha256: options.draftSha256 ?? 'e'.repeat(64),
            })),
          }
        }
        throw new Error(`Unexpected query ${path}`)
      },
      mutation: async (reference: unknown) => {
        const path = String((reference as Record<symbol, unknown>)[Symbol.for('functionName')])
        calls.push(path)
        if (path.endsWith('editor:previewPublishEntryOperation')) {
          return { allowed: true, confirmation: { token: 'confirmation' } }
        }
        if (path.endsWith('editor:publishEntry')) return { status: 'applied' }
        throw new Error(`Unexpected mutation ${path}`)
      },
      action: async () => {
        throw new Error('Unexpected action')
      },
    }),
  }
}

describe('file-backed Content migration CLI', () => {
  it('accepts Better Convex local and anonymous authorities only on exact loopback origins', () => {
    expect(isLocalMigrationTarget('local:test', 'http://127.0.0.1:3210')).toBe(true)
    expect(isLocalMigrationTarget('anonymous:anonymous-agent', 'http://127.0.0.1:3210')).toBe(true)
    expect(isLocalMigrationTarget('anonymous:anonymous-agent', 'https://cms.example.test')).toBe(
      false,
    )
    expect(isLocalMigrationTarget('production:spoof', 'http://127.0.0.1:3210')).toBe(false)
    expect(isLocalMigrationTarget('local:spoof', 'http://127.0.0.1:3210/path')).toBe(false)
  })

  it('reuses an identical export after interruption before evidence was written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-migrate-retry-'))
    const migrationDirectory = join(root, '.ginko/migrations')
    const contract = buildResolvedContentContract(
      {
        collections: {
          pages: {
            type: 'page',
            source: 'content/**/*.md',
            route: '/',
            fields: { title: { type: 'text', required: true } },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const document: PortableDocumentV1 = {
      format: 'ginko-content-document',
      version: 1,
      collection: 'pages',
      canonicalKey: 'home',
      locale: 'en',
      slug: 'home',
      parentCanonicalKey: null,
      order: null,
      shared: { title: 'Home' },
      localized: {},
      body: { kind: 'mdc', source: '# Home' },
      visibility: { navigation: true, search: true, sitemap: true },
    }
    const content = {
      assessFilesystemPortability: vi.fn(),
      exportFilesystemToPortableDirectory: async ({ destination }: { destination: string }) => {
        await writePortableDirectory(destination, { contract, documents: [document], assets: [] })
        const verified = await verifyPortableDirectoryBounded(destination)
        return {
          directory: destination,
          inputHash: 'input-hash',
          contractSha256: await hashCanonicalJson(contract),
          manifestSha256: await hashCanonicalJson(verified.manifest),
          manifest: verified.manifest,
          documents: 1,
          assets: 0,
          collections: ['pages'],
          locales: ['en'],
        }
      },
    }

    const first = await stagePortableMigrationSnapshot({
      content,
      sourceRoot: root,
      migrationDirectory,
      inputHash: 'input-hash',
    })
    const resumed = await stagePortableMigrationSnapshot({
      content,
      sourceRoot: root,
      migrationDirectory,
      inputHash: 'input-hash',
    })

    expect(resumed.manifestSha256).toBe(first.manifestSha256)
    expect(resumed.portableDirectory).toBe(first.portableDirectory)
  })

  it('reports every local assessment error before reading target configuration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-migrate-assess-'))
    const stderr: string[] = []
    const status = await runMigrateCommand(
      ['migrate', 'from-content', '.', '--target', 'local'],
      root,
      { stderr: { write: (value) => stderr.push(value) } },
      undefined,
      {
        content: {
          assessFilesystemPortability: async () => ({
            ok: false,
            evidence: null,
            diagnostics: [
              {
                severity: 'error',
                code: 'unsupported-body',
                file: 'content/en.md',
                field: 'body',
                message: 'Body cannot be represented.',
                resolution: 'Replace the unsupported syntax.',
              },
              {
                severity: 'error',
                code: 'route-ambiguous',
                file: 'content/de.md',
                message: 'Route is ambiguous.',
              },
            ],
            summary: { documents: 0, assets: 0, collections: 0, locales: 0 },
          }),
          exportFilesystemToPortableDirectory: async () => {
            throw new Error('must not export')
          },
        },
      },
    )

    expect(status).toBe(2)
    expect(stderr.join('')).toContain('content/en.md:body')
    expect(stderr.join('')).toContain('content/de.md')
  })

  it('previews and publishes the exact unchanged imported revision set', async () => {
    const root = configuredRoot()
    evidence(root)
    const fake = client()
    const stdout: string[] = []
    const authorize = async () => 'short-lived-token'

    const preview = await runMigrateCommand(
      ['migrate', 'from-content', '--publish-preview'],
      root,
      { stdout: { write: (value) => stdout.push(value) } },
      fake.factory as never,
      { authorize },
    )
    expect(preview).toBe(0)
    expect(stdout.join('')).toContain('d'.repeat(64))
    expect(stdout.join('')).toContain('Exact revision report')
    expect(stdout.join('')).toContain('"entryId": "entry-001"')
    expect(stdout.join('')).toContain('"expectedVersion": 3')

    const published = await runMigrateCommand(
      ['migrate', 'from-content', '--publish', 'd'.repeat(64)],
      root,
      { stdout: { write: (value) => stdout.push(value) } },
      fake.factory as never,
      { authorize },
    )
    expect(published).toBe(0)
    expect(fake.calls.some((path) => path.endsWith('editor:previewPublishEntryOperation'))).toBe(
      true,
    )
    expect(fake.calls.some((path) => path.endsWith('editor:publishEntry'))).toBe(true)
  })

  it('rejects a changed draft before any publication mutation', async () => {
    const root = configuredRoot()
    evidence(root)
    const fake = client({ draftSha256: 'f'.repeat(64) })
    const status = await runMigrateCommand(
      ['migrate', 'from-content', '--publish', 'd'.repeat(64)],
      root,
      {},
      fake.factory as never,
      { authorize: async () => 'short-lived-token' },
    )

    expect(status).toBe(4)
    expect(fake.calls.some((path) => path.endsWith('editor:publishEntry'))).toBe(false)
  })

  it('preserves the reviewed publication baseline when apply resumes after an edit', async () => {
    const root = configuredRoot()
    evidence(root)
    const fake = client({ draftSha256: 'f'.repeat(64) })
    const apply = vi.fn(async () => ({ state: 'complete' }))
    const status = await runMigrateCommand(
      ['migrate', 'from-content', '--apply'],
      root,
      {},
      fake.factory as never,
      { authorize: async () => 'short-lived-token', apply: apply as never },
    )

    expect(status).toBe(4)
    expect(apply).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(
      readFileSync(join(root, '.ginko/migrations/from-content.json'), 'utf8'),
    ) as { publication: { sha256: string } }
    expect(saved.publication.sha256).toBe('d'.repeat(64))
  })

  it('pages publication evidence beyond one hundred entries', async () => {
    const root = configuredRoot()
    evidence(root, 101)
    const fake = client({ entryCount: 101 })
    const status = await runMigrateCommand(
      ['migrate', 'from-content', '--publish-preview'],
      root,
      {},
      fake.factory as never,
      { authorize: async () => 'short-lived-token' },
    )

    expect(status).toBe(0)
    expect(
      fake.calls.filter((path) => path.endsWith('listImportPublicationIdentities')),
    ).toHaveLength(2)
    expect(
      fake.calls.filter((path) => path.endsWith('inspectImportPublicationEntries')),
    ).toHaveLength(2)
  })
})
