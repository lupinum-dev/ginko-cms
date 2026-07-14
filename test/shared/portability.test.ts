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
  it('reads through the Content directory authority and emits a deterministic immutable plan', async () => {
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
      targetContractSha256: await hashCanonicalJson(contract),
      currentDraftSha256ByItemKey: new Map([[itemKey, null]]),
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
    expect(first.documentsByItemKey[itemKey]).toEqual(document)
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
      targetContractSha256: await hashCanonicalJson(contract),
    }
    const documentSha256 = await hashCanonicalJson(document)

    const skip = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentDraftSha256ByItemKey: new Map([[itemKey, documentSha256]]),
    })
    const update = await createPortableDraftImportPlan(bundle, {
      ...base,
      currentDraftSha256ByItemKey: new Map([[itemKey, 'f'.repeat(64)]]),
    })

    expect(skip.items[0]?.payload.effect).toBe('skip')
    expect(update.items[0]?.payload).toMatchObject({
      effect: 'update',
      expectedDraftSha256: 'f'.repeat(64),
    })
  })

  it('blocks asset-bearing imports until verified staging decisions exist', async () => {
    const { contract, document } = fixture()
    const bundle = {
      contract,
      documents: [{ file: 'content/posts/hello/en.md', document, bytes: new Uint8Array() }],
      assets: [
        {
          sha256: 'a'.repeat(64),
          file: `public/ginko-assets/${'a'.repeat(64)}.png`,
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
    const plan = await createPortableDraftImportPlan(bundle, {
      deploymentId: 'deployment-test',
      targetContractSha256: await hashCanonicalJson(contract),
      currentDraftSha256ByItemKey: new Map(),
    })

    expect(plan.blockers).toContain(
      'Portable asset staging is required before this plan can apply.',
    )
  })
})
