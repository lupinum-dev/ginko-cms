/// <reference types="vite/client" />

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  portableModelsSemanticallyEqual,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'
import {
  readPortableDirectory,
  writePortableDirectory,
} from '@lupinum/ginko-content/portability/node'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it } from 'vitest'

import {
  applyPreparedPortableDraftImport,
  exportPortablePublishedContent,
  preparePortableDraftImport,
} from '../../packages/cms/src/portability/commands.js'
import { createCtx, publishEntry, seedMember, seedSettings } from './entries/helpers'

const api = anyApi
const functionName = Symbol.for('functionName')
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): { contract: ResolvedContentContractV1; documents: PortableDocumentV1[] } {
  const contract = buildResolvedContentContract(
    {
      collections: {
        markdown: {
          type: 'page',
          source: 'content/markdown/**/*.md',
          route: '/markdown',
          fields: { title: { type: 'text', required: true } },
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
    slug: canonicalKey,
    parentCanonicalKey: null,
    order: null,
    shared: { title: collection === 'markdown' ? 'Markdown café' : 'MDC 東京' },
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
      page('mdc', 'mdc.article', '::callout{tone="info"}\nNamed portable component content.\n::\n'),
      data('yaml'),
      data('json'),
    ],
  }
}

async function installCms() {
  const ctx = createCtx()
  await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
  await seedSettings(ctx)
  const { contract, documents } = fixture()
  const contractSha256 = await hashCanonicalJson(contract)
  await ctx.raw.mutation(api.policy.installCmsPolicy, { contract, contractSha256 })
  return { ctx, owner: ctx.asCmsUser('owner-1'), contract, contractSha256, documents }
}

async function importDirectory(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  directory: string,
  contractSha256: string,
) {
  const client = portabilityClient(owner)
  const prepared = await preparePortableDraftImport(client as never, directory, {
    deploymentId: 'test-deployment',
    targetContractSha256: contractSha256,
  })
  await applyPreparedPortableDraftImport(client as never, prepared)
  return prepared
}

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
      assets: [],
    })

    await importDirectory(first.owner, source, first.contractSha256)
    await publishAll(first.ctx, first.owner)
    await exportPortablePublishedContent(portabilityClient(first.owner) as never, exported, {
      deploymentId: 'test-deployment',
      collections: Object.keys(first.contract.collections),
      contract: first.contract,
      runId: 'semantic-export',
      assetTransfer: {
        cmsOrigin: 'https://cms.example.test',
        sessionCookie: 'better-auth.session_token=test-session-token',
      },
    })

    const sourceBundle = await readPortableDirectory(source)
    const exportedBundle = await readPortableDirectory(exported)
    expect(
      portableModelsSemanticallyEqual(
        {
          documents: sourceBundle.documents.map(({ document }) => document),
          assets: sourceBundle.assets,
        },
        {
          documents: exportedBundle.documents.map(({ document }) => document),
          assets: exportedBundle.assets,
        },
      ),
    ).toBe(true)

    const second = await installCms()
    const imported = await importDirectory(second.owner, exported, second.contractSha256)
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
        targetContractSha256: second.contractSha256,
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
