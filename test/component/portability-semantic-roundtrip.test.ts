/// <reference types="vite/client" />

import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import { normalizePortableModel, type PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import {
  readPortableDirectory,
  writePortableDirectory,
} from '@lupinum/ginko-content/portability/node'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyPreparedPortableDraftImport,
  exportPortablePublishedContent,
  preparePortableDraftImport,
} from '../../packages/cms/src/portability/commands.js'
import { createCtx, publishEntry, seedMember } from './entries/helpers'

const api = anyApi
const functionName = Symbol.for('functionName')
const roots: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const assetBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const assetSha256 = createHash('sha256').update(assetBytes).digest('hex')
const assetReference = {
  kind: 'local' as const,
  path: `/ginko-assets/${assetSha256}.png` as const,
  sha256: assetSha256,
  bytes: assetBytes.byteLength,
  mediaType: 'image/png' as const,
  originalFilename: 'portable-pixel.png',
}

function fixture() {
  const contract = buildResolvedContentContract(
    {
      collections: {
        markdown: {
          type: 'page',
          source: 'content/markdown/**/*.md',
          route: '/markdown',
          cms: { fields: { hero: { type: 'image', required: false } } },
        },
        mdc: {
          type: 'page',
          source: 'content/mdc/**/*.md',
          route: '/mdc',
          fields: { title: { type: 'text', required: true } },
        },
        yaml: { type: 'data', source: 'content/yaml/**/*.yml' },
        json: { type: 'data', source: 'content/json/**/*.json' },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  contract.collections.mdc.componentPolicy = {
    components: {
      callout: {
        kind: 'block',
        props: { tone: { type: 'string', required: true } },
        slots: ['default'],
        media: null,
      },
    },
  }
  const template = contract.collections.markdown.fields[0]!
  const dataFields: ResolvedContentFieldV1[] = [
    {
      ...template,
      key: 'title',
      role: 'title',
      localized: true,
      required: true,
    },
    {
      ...template,
      key: 'metadata',
      type: 'json',
      role: null,
      localized: false,
      required: false,
    },
  ]
  contract.collections.yaml.fields = dataFields
  contract.collections.json.fields = dataFields.map((field) => ({ ...field }))

  const page = (
    collection: 'markdown' | 'mdc',
    canonicalKey: string,
    source: string,
  ): PortableDocumentV1 => ({
    format: 'ginko-content-document',
    version: 1,
    collection,
    canonicalKey,
    locale: 'en',
    slug: canonicalKey.replaceAll('.', '-'),
    parentCanonicalKey: null,
    order: null,
    shared: {
      title: collection === 'markdown' ? 'Markdown café' : 'MDC 東京',
      ...(collection === 'markdown' ? { hero: assetReference } : {}),
    },
    localized: {},
    body: { kind: 'mdc', source },
    visibility: { navigation: true, search: true, sitemap: true },
  })
  const data = (collection: 'yaml' | 'json'): PortableDocumentV1 => ({
    format: 'ginko-content-document',
    version: 1,
    collection,
    canonicalKey: `${collection}.profile`,
    locale: 'en',
    slug: '',
    parentCanonicalKey: null,
    order: null,
    shared: {
      metadata: {
        active: true,
        aliases: ['Ada', 'Augusta'],
        nested: { date: '1815-12-10', note: null, unicode: 'café 東京 😀' },
      },
    },
    localized: { title: `${collection.toUpperCase()} profile` },
    body: null,
    visibility: { navigation: false, search: false, sitemap: false },
  })

  return {
    contract,
    documents: [
      page(
        'markdown',
        'markdown.article',
        '# Heading\n\nParagraph with **strong**, [link](https://example.test), and `code`.\n',
      ),
      page(
        'mdc',
        'mdc.article',
        '::callout\n---\ntone: info\n---\nNamed portable component content.\n::\n',
      ),
      data('yaml'),
      data('json'),
    ],
    assets: [
      {
        sha256: assetSha256,
        file: `public/ginko-assets/${assetSha256}.png`,
        bytes: assetBytes.byteLength,
        mediaType: 'image/png' as const,
        content: assetBytes,
      },
    ],
  }
}

async function installCms() {
  const ctx = createCtx()
  await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
  const { contract, documents, assets } = fixture()
  const contentHash = await hashCanonicalJson(contract)
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  return { ctx, owner: ctx.asCmsUser('owner-1'), contract, contentHash, documents, assets }
}

async function importDirectory(
  ctx: ReturnType<typeof createCtx>,
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  directory: string,
  contentHash: string,
) {
  const client = portabilityClient(owner)
  const prepared = await preparePortableDraftImport(client as never, directory, {
    deploymentId: 'test-deployment',
    targetContentHash: contentHash,
  })
  for (const asset of prepared.assets) {
    if (asset.payload.effect !== 'upload') continue
    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([assetBytes], { type: asset.payload.mediaType })),
    )) as string
    const storageUrl = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.getUrl(storageId as never),
    )) as string
    const attemptTokenHash = 'a'.repeat(64)
    await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: prepared.runId,
      payloadSha256: prepared.payloadSha256,
      sha256: asset.payload.sha256,
      attemptTokenHash,
      storageOrigin: new URL(storageUrl).origin,
    })
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: prepared.runId,
      payloadSha256: prepared.payloadSha256,
      sha256: asset.payload.sha256,
      attemptTokenHash,
      attemptGeneration: 1,
      storageId,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(assetBytes, { headers: { 'content-type': 'image/png' } })),
    )
    await owner.action(api.portability.verifyPortableAssetUpload, {
      runId: prepared.runId,
      payloadSha256: prepared.payloadSha256,
      sha256: asset.payload.sha256,
      attemptTokenHash,
      attemptGeneration: 1,
    })
  }
  await applyPreparedPortableDraftImport(client as never, prepared, {
    cmsOrigin: 'https://cms.example.test',
    sessionCookie: 'better-auth.session_token=test-session-token',
    fetch: async () => Response.json({ state: 'attached', assetId: 'already-attached' }),
  })
  return prepared
}

function exportAssetFetch(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
): typeof globalThis.fetch {
  const token = 'semantic-roundtrip-download-token-0001'
  return async (input, init) => {
    const url = new URL(String(input))
    const parts = url.pathname.split('/')
    const holdId = parts.at(-1) === 'download-attempt' ? parts.at(-2)! : parts.at(-1)!
    const runId = new Headers(init?.headers).get('x-ginko-portability-run')!
    if (url.pathname.endsWith('/download-attempt')) {
      const attempt = await owner.mutation(api.portability.beginPortableAssetDownload, {
        runId,
        holdId,
        downloadTokenHash: createHash('sha256').update(token).digest('hex'),
      })
      return Response.json({
        state: 'attempt',
        token,
        downloadGeneration: attempt.downloadGeneration,
      })
    }
    await owner.mutation(api.portability.claimPortableAssetDownload, {
      runId,
      holdId,
      downloadTokenHash: createHash('sha256').update(token).digest('hex'),
      downloadGeneration: Number(new Headers(init?.headers).get('x-ginko-portability-generation')),
    })
    return new Response(assetBytes, {
      headers: {
        'content-length': String(assetBytes.byteLength),
        'content-type': 'image/png',
      },
    })
  }
}

const portableAssetFacts = (assets: Awaited<ReturnType<typeof readPortableDirectory>>['assets']) =>
  assets.map(({ content: _content, ...asset }) => asset)

function portabilityClient(owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>) {
  const reference = (value: unknown) => {
    const path = String((value as Record<symbol, unknown>)[functionName])
    const name = path.slice(path.lastIndexOf(':') + 1)
    return api.portability[name]
  }
  return {
    query: async (value: unknown, args: Record<string, unknown>) =>
      await owner.query(reference(value), args as never),
    mutation: async (value: unknown, args: Record<string, unknown>) =>
      await owner.mutation(reference(value), args as never),
    action: async (value: unknown, args: Record<string, unknown>) =>
      await owner.action(reference(value), args as never),
  }
}

async function publishAll(
  ctx: ReturnType<typeof createCtx>,
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
) {
  const entries = (await ctx.readAll('entries')) as Array<{ _id: string }>
  for (const entry of entries) await publishEntry(owner, entry._id)
}

describe('bidirectional filesystem and CMS semantic portability', () => {
  it('preserves Markdown, MDC, YAML, and JSON through both directions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-cms-semantic-roundtrip-'))
    roots.push(root)
    const source = join(root, 'source')
    const exported = join(root, 'exported')
    const first = await installCms()
    await writePortableDirectory(source, {
      contract: first.contract,
      documents: first.documents,
      assets: first.assets,
    })

    await importDirectory(first.ctx, first.owner, source, first.contentHash)
    await publishAll(first.ctx, first.owner)
    await exportPortablePublishedContent(portabilityClient(first.owner) as never, exported, {
      deploymentId: 'test-deployment',
      collections: Object.keys(first.contract.collections),
      contract: first.contract,
      runId: 'semantic-export',
      assetTransfer: {
        cmsOrigin: 'https://cms.example.test',
        sessionCookie: 'better-auth.session_token=test-session-token',
        fetch: exportAssetFetch(first.owner),
      },
    })

    const sourceBundle = await readPortableDirectory(source)
    const exportedBundle = await readPortableDirectory(exported)
    expect(
      normalizePortableModel({
        documents: exportedBundle.documents.map(({ document }) => document),
        assets: portableAssetFacts(exportedBundle.assets),
      }),
    ).toEqual(
      normalizePortableModel({
        documents: sourceBundle.documents.map(({ document }) => document),
        assets: portableAssetFacts(sourceBundle.assets),
      }),
    )

    const second = await installCms()
    const imported = await importDirectory(second.ctx, second.owner, exported, second.contentHash)
    expect(imported.items.map(({ payload }) => payload.effect)).toEqual([
      'create',
      'create',
      'create',
      'create',
    ])
    const replay = await preparePortableDraftImport(
      portabilityClient(second.owner) as never,
      exported,
      {
        deploymentId: 'test-deployment',
        targetContentHash: second.contentHash,
      },
    )
    expect(replay.items.map(({ payload }) => payload.effect)).toEqual([
      'skip',
      'skip',
      'skip',
      'skip',
    ])
  })
})
