import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { writePortableDirectory } from '@lupinum/ginko-content/portability/node'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createPortableDraftImportPlan,
  readCmsPortableDirectory,
  verifyCmsPortableDirectory,
} from '../../packages/cms/src/portability/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
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
    canonicalKey: 'hello',
    locale: 'en',
    slug: 'hello',
    parentCanonicalKey: null,
    order: null,
    shared: { title: 'Hello' },
    localized: {},
    body: { kind: 'mdc', source: '# Hello' },
    visibility: { navigation: true, search: true, sitemap: true },
  }
  return { contract, document }
}

describe('CMS portable draft import planning', () => {
  it('verifies through the bounded Content directory authority', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ginko-cms-portability-'))
    roots.push(root)
    const directory = join(root, 'bundle')
    const { contract, document } = fixture()
    await writePortableDirectory(directory, { contract, documents: [document], assets: [] })

    const verified = await verifyCmsPortableDirectory(directory)

    expect(verified).toMatchObject({
      contract,
      manifest: { format: 'ginko-content-portable', version: 1 },
    })
    expect(verified).not.toHaveProperty('documents')
    expect(verified).not.toHaveProperty('assets')
  })

  it('[IMP-01] verifies input and emits a deterministic immutable import preview without content writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ginko-cms-portability-'))
    roots.push(root)
    const directory = join(root, 'bundle')
    const { contract, document } = fixture()
    await writePortableDirectory(directory, { contract, documents: [document], assets: [] })
    const bundle = await readCmsPortableDirectory(directory)
    const identity = {
      collection: document.collection,
      canonicalKey: document.canonicalKey,
      locale: document.locale,
    }
    const itemKey = await hashCanonicalJson(identity)
    const options = {
      deploymentId: 'deployment-test',
      targetContentHash: await hashCanonicalJson(contract),
      currentDraftSha256ByItemKey: new Map([[itemKey, null]]),
      currentSharedSha256ByItemKey: new Map([[itemKey, null]]),
    }

    const first = await createPortableDraftImportPlan(bundle, options)
    const second = await createPortableDraftImportPlan(bundle, options)

    expect(second).toEqual(first)
    expect(first.payload).toMatchObject({
      format: 'ginko-cms-portability-plan',
      version: 1,
      mode: 'import',
      itemCount: 1,
      assetCount: 0,
      scope: { collections: ['posts'] },
    })
    expect(first.items).toEqual([
      expect.objectContaining({
        itemKey,
        payload: expect.objectContaining({ effect: 'create', expectedDraftSha256: null }),
      }),
    ])
    expect(first.items[0]?.document).toEqual(document)
    expect(first.blockers).toEqual([])
  })

  it('plans skip and guarded update from exact current draft hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ginko-cms-portability-'))
    roots.push(root)
    const directory = join(root, 'bundle')
    const { contract, document } = fixture()
    await writePortableDirectory(directory, { contract, documents: [document], assets: [] })
    const bundle = await readCmsPortableDirectory(directory)
    const itemKey = await hashCanonicalJson({
      collection: 'posts',
      canonicalKey: 'hello',
      locale: 'en',
    })
    const base = {
      deploymentId: 'deployment-test',
      targetContentHash: await hashCanonicalJson(contract),
    }
    const documentSha256 = await hashCanonicalJson(document)

    const skip = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentDraftSha256ByItemKey: new Map([[itemKey, documentSha256]]),
      currentSharedSha256ByItemKey: new Map([[itemKey, 'e'.repeat(64)]]),
    })
    const update = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentDraftSha256ByItemKey: new Map([[itemKey, 'f'.repeat(64)]]),
      currentSharedSha256ByItemKey: new Map([[itemKey, 'e'.repeat(64)]]),
    })

    expect(skip.items[0]?.payload.effect).toBe('skip')
    expect(update.items[0]?.payload).toMatchObject({
      effect: 'update',
      expectedDraftSha256: 'f'.repeat(64),
    })
  })

  it('rejects an import whose distinct locale count exceeds the operational envelope', async () => {
    const { contract, document } = fixture()
    const documents = Array.from({ length: 4 }, (_, index) => ({
      file: `content/posts/hello/locale-${index}.md`,
      bytes: new Uint8Array(),
      document: {
        ...document,
        locale: `locale-${index}`,
      },
    }))
    const currentDraftSha256ByItemKey = new Map<string, null>()
    const currentSharedSha256ByItemKey = new Map<string, null>()
    for (const { document: candidate } of documents) {
      currentDraftSha256ByItemKey.set(
        await hashCanonicalJson({
          collection: candidate.collection,
          canonicalKey: candidate.canonicalKey,
          locale: candidate.locale,
        }),
        null,
      )
      currentSharedSha256ByItemKey.set(
        await hashCanonicalJson({
          collection: candidate.collection,
          canonicalKey: candidate.canonicalKey,
          locale: candidate.locale,
        }),
        null,
      )
    }

    await expect(
      createPortableDraftImportPlan(
        {
          contract,
          documents,
          assets: [],
          manifest: {
            format: 'ginko-content-portable',
            version: 1,
            contract: {
              file: '.ginko/content-contract.json',
              sha256: await hashCanonicalJson(contract),
            },
            documents: [],
            assets: [],
          },
        },
        {
          deploymentId: 'deployment-test',
          targetContentHash: await hashCanonicalJson(contract),
          currentDraftSha256ByItemKey,
          currentSharedSha256ByItemKey,
        },
      ),
    ).rejects.toThrow(/locale count exceeds 3/i)
  })

  it('accepts an exact depth-five tree and rejects a depth-six final import graph', async () => {
    const contract = buildResolvedContentContract(
      {
        collections: {
          pages: {
            type: 'page',
            source: 'content/pages/**/*.md',
            route: '/pages',
            cms: { type: 'tree', route: { allowMultipleRoots: true } },
            fields: { title: { type: 'text', required: true } },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const documents = Array.from({ length: 6 }, (_, index) => {
      const canonicalKey = `page-${index + 1}`
      return {
        file: `content/pages/${canonicalKey}/en.md`,
        bytes: new Uint8Array(),
        document: {
          format: 'ginko-content-document' as const,
          version: 1 as const,
          collection: 'pages',
          canonicalKey,
          locale: 'en',
          slug: canonicalKey,
          parentCanonicalKey: index === 0 ? null : `page-${index}`,
          order: index.toString(16).toUpperCase().padStart(16, '0'),
          shared: { title: canonicalKey },
          localized: {},
          body: { kind: 'mdc' as const, source: `# ${canonicalKey}` },
          visibility: { navigation: true, search: true, sitemap: true },
        },
      }
    })
    const bundle = {
      contract,
      documents,
      assets: [],
      manifest: {
        format: 'ginko-content-portable' as const,
        version: 1 as const,
        contract: {
          file: '.ginko/content-contract.json' as const,
          sha256: await hashCanonicalJson(contract),
        },
        documents: [],
        assets: [],
      },
    }
    const inspected = async (count: number) => {
      const draft = new Map<string, null>()
      const shared = new Map<string, null>()
      for (const { document } of documents.slice(0, count)) {
        const itemKey = await hashCanonicalJson({
          collection: document.collection,
          canonicalKey: document.canonicalKey,
          locale: document.locale,
        })
        draft.set(itemKey, null)
        shared.set(itemKey, null)
      }
      return { draft, shared }
    }
    const exact = await inspected(5)
    await expect(
      createPortableDraftImportPlan(
        { ...bundle, documents: documents.slice(0, 5) },
        {
          deploymentId: 'deployment-test',
          targetContentHash: await hashCanonicalJson(contract),
          currentDraftSha256ByItemKey: exact.draft,
          currentSharedSha256ByItemKey: exact.shared,
        },
      ),
    ).resolves.toMatchObject({ payload: { itemCount: 5 } })

    const tooDeep = await inspected(6)
    await expect(
      createPortableDraftImportPlan(bundle, {
        deploymentId: 'deployment-test',
        targetContentHash: await hashCanonicalJson(contract),
        currentDraftSha256ByItemKey: tooDeep.draft,
        currentSharedSha256ByItemKey: tooDeep.shared,
      }),
    ).rejects.toThrow(/tree depth of 5/i)
  })

  it('rejects document and asset limit-plus-one bundles before planning work begins', async () => {
    const { contract, document } = fixture()
    const baseBundle = {
      contract,
      manifest: {
        format: 'ginko-content-portable' as const,
        version: 1 as const,
        contract: { file: '.ginko/content-contract.json' as const, sha256: 'b'.repeat(64) },
        documents: [],
        assets: [],
      },
    }
    const options = {
      deploymentId: 'deployment-test',
      targetContentHash: await hashCanonicalJson(contract),
      currentDraftSha256ByItemKey: new Map<string, null>(),
      currentSharedSha256ByItemKey: new Map<string, null>(),
    }

    await expect(
      createPortableDraftImportPlan(
        {
          ...baseBundle,
          documents: Array.from({ length: 5_001 }, (_, index) => ({
            file: `content/posts/${index}/en.md`,
            bytes: new Uint8Array(),
            document: { ...document, canonicalKey: String(index), slug: String(index) },
          })),
          assets: [],
        },
        options,
      ),
    ).rejects.toThrow(/document count exceeds 5000/i)

    await expect(
      createPortableDraftImportPlan(
        {
          ...baseBundle,
          documents: [],
          assets: Array.from({ length: 501 }, (_, index) => ({
            sha256: index.toString(16).padStart(64, '0'),
            file: `public/ginko-assets/${index}.png`,
            bytes: 1,
            mediaType: 'image/png' as const,
            content: new Uint8Array([0]),
          })),
        },
        options,
      ),
    ).rejects.toThrow(/asset count exceeds 500/i)
  })

  it('discovers MDC assets and deterministically plans upload, reuse, and metadata conflicts', async () => {
    const { contract, document } = fixture()
    const sha256 = 'a'.repeat(64)
    const assetDocument = {
      ...document,
      body: {
        kind: 'mdc' as const,
        source: `![Hero](/ginko-assets/${sha256}.png)`,
      },
    }
    const bundle = {
      contract,
      documents: [
        { file: 'content/posts/hello/en.md', document: assetDocument, bytes: new Uint8Array() },
      ],
      assets: [
        {
          sha256,
          file: `public/ginko-assets/${sha256}.png`,
          bytes: 1,
          mediaType: 'image/png' as const,
          content: new Uint8Array([0]),
        },
      ],
      manifest: {
        format: 'ginko-content-portable' as const,
        version: 1 as const,
        contract: { file: '.ginko/content-contract.json' as const, sha256: 'b'.repeat(64) },
        documents: [],
        assets: [],
      },
    }
    const itemKey = await hashCanonicalJson({
      collection: 'posts',
      canonicalKey: 'hello',
      locale: 'en',
    })
    const base = {
      deploymentId: 'deployment-test',
      targetContentHash: await hashCanonicalJson(contract),
      currentDraftSha256ByItemKey: new Map([[itemKey, null]]),
      currentSharedSha256ByItemKey: new Map([[itemKey, null]]),
    }

    const upload = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentAssetBySha256: new Map(),
    })
    const reuse = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentAssetBySha256: new Map([
        [sha256, { assetId: 'asset-1', bytes: 1, mediaType: 'image/png' as const }],
      ]),
    })
    const conflict = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentAssetBySha256: new Map([
        [sha256, { assetId: 'asset-1', bytes: 2, mediaType: 'image/png' as const }],
      ]),
    })

    expect(upload.assets[0]?.payload).toMatchObject({ effect: 'upload', referencedBy: [itemKey] })
    expect(upload.items[0]?.payload.dependencyKeys).toContain(sha256)
    expect(upload.blockers).toEqual([])
    expect(reuse.assets[0]?.payload.effect).toBe('reuse')
    expect(reuse.blockers).toEqual([])
    expect(conflict.assets[0]?.payload.effect).toBe('conflict')
    expect(conflict.blockers).toEqual([`Portable asset ${sha256} conflicts with stored metadata.`])
  })
})
