import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContract,
} from '@lupinum/ginko-content/cms-contract'
import {
  parsePortableDocument,
  portableDocumentPath,
  serializePortableDocument,
} from '@lupinum/ginko-content/portability'
import { describe, expect, it } from 'vitest'

import { portablePublishedDocument } from '#component/portability/items'

import { api, createCtx, currentDraftVersion, publishEntry, seedOwner } from '../helpers'

function contract(structured: boolean, keepCopy = false) {
  return buildResolvedContentContract(
    {
      collections: {
        pages: {
          type: 'page',
          ...(structured ? { body: false } : {}),
          i18n: true,
          route: { en: '/pages', de: '/seiten' },
          cms: {
            type: 'flat',
            fields: {
              destination: { type: 'text', localized: true },
              ...(keepCopy
                ? { preservedCopy: { type: 'richtext' as const, localized: true } }
                : {}),
            },
          },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en', 'de'], componentPolicy: { version: 2, components: {} } },
  )
}

async function install(ctx: ReturnType<typeof createCtx>, content: ResolvedContentContract) {
  const presentation = { collections: {} }
  return await ctx.raw.mutation(api.contract.installCmsContract, {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

async function fixture(structured: boolean, bodyMdc = '') {
  const ctx = createCtx()
  await seedOwner(ctx)
  const content = contract(structured)
  await install(ctx, content)
  const owner = ctx.asCmsUser('owner-1')
  const entryId = await owner.createEntry({
    collection: 'pages',
    slug: 'home',
    locale: 'en',
    localized: { title: 'Connected worlds', description: 'An introduction', destination: '/blog' },
    bodyMdc,
  })
  return { ctx, owner, entryId, content }
}

async function startTransition(
  ctx: ReturnType<typeof createCtx>,
  target: ResolvedContentContract,
  runKey: string,
) {
  const presentation = { collections: {} }
  return await ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
    runKey,
    targetContent: target,
    targetContentHash: await hashCanonicalJson(target),
    targetPresentation: presentation,
    targetPresentationHash: await hashCanonicalJson(presentation),
    actor: 'owner-cli',
  })
}

async function stagedOutput(ctx: ReturnType<typeof createCtx>, runId: string) {
  const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  const list = await ctx.raw.query(api.contractTransitions.listContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor: status.cursor,
    limit: 10,
  })
  const item = list.page[0]!
  const current = item.current
  const output = {
    slug: current.slug,
    parentEntryId: current.parentEntryId,
    orderRank: current.orderRank,
    nodeKind: current.nodeKind,
    shared: current.shared,
    locales: Object.fromEntries(
      Object.entries(current.locales).map(([locale, value]) => {
        const row = value as {
          slug: string | null
          values: Record<string, string>
          bodyMdc: string
        }
        return [locale, { slug: row.slug, values: row.values, bodyMdc: row.bodyMdc }]
      }),
    ),
  }
  return {
    output,
    stage: async () =>
      ctx.raw.mutation(api.contractTransitions.stageContractTransitionPage, {
        runId,
        generation: status.generation,
        cursor: status.cursor,
        limit: 10,
        items: [
          {
            entryId: item.entryId,
            inputDraftVersion: item.inputDraftVersion,
            inputHash: item.inputHash,
            outputHash: await hashCanonicalJson(output),
            output,
          },
        ],
      }),
  }
}

async function applyTransition(ctx: ReturnType<typeof createCtx>, runId: string) {
  let status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  while (status.state === 'validating') {
    await ctx.raw.mutation(api.contractTransitions.validateContractTransitionPage, {
      runId,
      generation: status.generation,
      cursor: status.cursor,
      limit: 10,
    })
    status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  }
  const applied = await ctx.raw.mutation(api.contractTransitions.applyContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor: status.cursor,
    limit: 5,
    actor: 'owner-cli',
  })
  await ctx.raw.mutation(api.contractTransitions.activateContractTransition, {
    runId,
    generation: applied.generation,
    actor: 'owner-cli',
  })
}

describe('structured CMS pages', () => {
  it('keeps default articles and their public body unchanged under a V2 contract', async () => {
    const { ctx, owner, entryId, content } = await fixture(
      false,
      '# Article\n\nKeep every paragraph.',
    )
    expect(content.collections.pages!.portable).toEqual({ format: 'mdc', bodyField: 'bodyMdc' })
    const preview = await owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' })
    expect(preview.bodyAstJson).toContain('Keep every paragraph.')
    await publishEntry(owner, entryId)
    const published = await ctx.published.query(api.public.page, {
      collection: 'pages',
      locale: 'en',
      path: '/pages/home',
    })
    expect(JSON.stringify(published)).toContain('Keep every paragraph.')
  })

  it('previews and publishes structured routed pages with a null body and independent language publication', async () => {
    const { ctx, owner, entryId } = await fixture(true)
    const preview = await owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' })
    expect(preview).toMatchObject({
      bodyAstJson: null,
      toc: null,
      path: '/pages/home',
      data: { destination: '/blog' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { locales: { de: { values: { title: 'Verbundene Welten' } } } },
    })
    await publishEntry(owner, entryId, ['en'])
    const published = await ctx.published.query(api.public.page, {
      collection: 'pages',
      locale: 'en',
      path: '/pages/home',
    })
    expect(published).toMatchObject({
      status: 'found',
      page: { bodyAst: null, data: { destination: '/blog' } },
    })
    expect((await ctx.readAll('publicEntries')).map((row) => row.locale)).toEqual(['en'])
    const sitemap = await ctx.raw.query(api.public.sitemap, { collection: 'pages', locale: 'en' })
    expect(JSON.stringify(sitemap)).toContain('/pages/home')
  })

  it('rejects hidden article-body content on creation and save without partial changes', async () => {
    const { ctx, owner, entryId } = await fixture(true)
    await expect(
      owner.createEntry({
        collection: 'pages',
        slug: 'bad',
        localized: { title: 'Bad' },
        bodyMdc: 'Do not hide this',
      }),
    ).rejects.toThrow(/ENTRY_BODY_NOT_SUPPORTED/)
    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: await currentDraftVersion(owner, entryId),
        patch: { locales: { en: { values: { title: 'Changed' }, bodyMdc: 'Do not hide this' } } },
      }),
    ).rejects.toThrow(/ENTRY_BODY_NOT_SUPPORTED/)
    expect((await ctx.readAll('entryLocaleDrafts'))[0].values.title).toBe('Connected worlds')
    await expect(
      owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'de' }),
    ).rejects.toThrow(/DRAFT_PREVIEW_LOCALE_MISSING/)
  })

  it('round trips the published structured document through portable JSON without losing route or fields', async () => {
    const { ctx, owner, entryId, content } = await fixture(true)
    await publishEntry(owner, entryId)
    const document = await ctx.raw.run(async (inner) => {
      const row = await inner.db.query('publicEntries').first()
      const entry = row ? await inner.db.get(row.entryId) : null
      if (!row || !entry) throw new Error('Missing publication fixture')
      return await portablePublishedDocument(inner, {
        revisionId: row.revisionId,
        collection: 'pages',
        canonicalKey: entry.stableId,
        locale: 'en',
        contract: content,
      })
    })
    expect(document).toMatchObject({
      body: null,
      slug: 'home',
      localized: { destination: '/blog' },
    })
    const filename = portableDocumentPath(document, content)
    expect(filename).toMatch(/\.json$/)
    const source = await serializePortableDocument(document, content)
    expect(await parsePortableDocument(source, content, filename)).toEqual(document)
  })

  it('requires a reviewed transition to remove an article body and allows cancellation without changes', async () => {
    const { ctx, content } = await fixture(false, 'Original article source')
    const before = await ctx.readAll('entryLocaleDrafts')
    await expect(install(ctx, contract(true))).rejects.toThrow(/CMS_CONTRACT_TRANSITION_REQUIRED/)
    const run = await startTransition(ctx, contract(true), 'remove-body')
    const staged = await stagedOutput(ctx, run.runId)
    staged.output.locales.en!.bodyMdc = ''
    await expect(staged.stage()).rejects.toThrow(/CONTRACT_TRANSITION_BODY_LOSS/)
    await ctx.raw.mutation(api.contractTransitions.cancelContractTransition, { runId: run.runId })
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before)
    expect((await ctx.readAll('cmsContract'))[0].content).toEqual(content)
  })

  it('keeps asset-bearing article bodies until media have an explicit field migration', async () => {
    const { ctx } = await fixture(false, '![Keep image](abcdefghijklmnopqrstuvwxyz123456)')
    const before = await ctx.readAll('entryLocaleDrafts')
    const run = await startTransition(ctx, contract(true, true), 'preserve-media')
    const staged = await stagedOutput(ctx, run.runId)
    staged.output.locales.en!.values.preservedCopy = staged.output.locales.en!.bodyMdc
    staged.output.locales.en!.bodyMdc = ''
    await expect(staged.stage()).rejects.toThrow(
      /CONTRACT_TRANSITION_BODY_ASSETS_REQUIRE_MIGRATION/,
    )
    await ctx.raw.mutation(api.contractTransitions.cancelContractTransition, { runId: run.runId })
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before)
  })

  it('preserves an article in an explicit field during reviewed cutover and restores it with an inverse transition', async () => {
    const { ctx, owner, entryId, content } = await fixture(false, 'Original article source')
    const run = await startTransition(ctx, contract(true, true), 'preserve-body')
    const staged = await stagedOutput(ctx, run.runId)
    staged.output.locales.en!.values.preservedCopy = staged.output.locales.en!.bodyMdc
    staged.output.locales.en!.bodyMdc = ''
    await staged.stage()
    await applyTransition(ctx, run.runId)
    expect((await ctx.readAll('entryLocaleDrafts'))[0]).toMatchObject({
      bodyMdc: '',
      values: { preservedCopy: 'Original article source' },
    })
    const rollback = await startTransition(ctx, content, 'restore-body')
    const reversed = await stagedOutput(ctx, rollback.runId)
    reversed.output.locales.en!.bodyMdc = reversed.output.locales.en!.values.preservedCopy!
    delete reversed.output.locales.en!.values.preservedCopy
    await reversed.stage()
    await applyTransition(ctx, rollback.runId)
    const preview = await owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' })
    expect(preview.bodyAstJson).toContain('Original article source')
  })
})
