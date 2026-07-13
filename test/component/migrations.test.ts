/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { api, createCtx } from '../helpers'

async function seedMigrationEntry(ctx: ReturnType<typeof createCtx>) {
  const now = Date.now()
  const collectionId = await ctx.seed(
    'collections' as never,
    {
      slug: 'posts',
      label: 'Posts',
      icon: null,
      type: 'flat',
      routing: { mode: 'route', pathPrefix: '/posts', slugMode: 'shared' },
      locales: ['en'],
      fields: [{ key: 'title', type: 'text', localized: true }],
      settings: { defaultLocale: 'en' },
      contract: { source: 'code', version: 'from-policy' },
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
    } as never,
  )
  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'hello',
      stableId: 'post-1',
      status: 'draft',
      dirtyLocales: ['en'],
      draftVersion: 1,
      createdBy: 'test',
      updatedBy: 'test',
      createdAt: now,
      updatedAt: now,
    } as never,
  )
  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: null,
      baseRevisionId: null,
      shared: {},
      updatedBy: 'test',
      updatedAt: now,
    } as never,
  )
  await ctx.seed(
    'entryDrafts' as never,
    {
      entryId,
      locale: 'en',
      baseRevisionId: null,
      values: { title: 'Before' },
      bodyMdc: '',
      updatedBy: 'test',
      updatedAt: now,
    } as never,
  )
  await ctx.seed(
    'cmsPolicies' as never,
    {
      key: 'active',
      contract: {},
      contractSha256: 'from-policy',
      installedAt: now,
      installedBy: 'deployment',
    } as never,
  )
  return { entryId }
}

describe('resumable content migration ledger', () => {
  it('rejects reuse of a migration id with different source bytes', async () => {
    const ctx = createCtx()
    await seedMigrationEntry(ctx)
    await ctx.raw.mutation(api.migrations.beginContentMigration, {
      migrationId: 'rename-title',
      sourceHash: 'source-a',
      toContractHash: 'to-policy',
    })

    await expect(
      ctx.raw.mutation(api.migrations.beginContentMigration, {
        migrationId: 'rename-title',
        sourceHash: 'source-b',
        toContractHash: 'to-policy',
      }),
    ).rejects.toThrow(/source/i)
  })

  it('commits receipts with the batch cursor, skips retry, and conflicts after user edits', async () => {
    const ctx = createCtx()
    const { entryId } = await seedMigrationEntry(ctx)
    const run = await ctx.raw.mutation(api.migrations.beginContentMigration, {
      migrationId: 'rename-title',
      sourceHash: 'source-a',
      toContractHash: 'to-policy',
    })
    const listed = await ctx.raw.query(api.migrations.listContentMigrationEntries, {
      collection: 'posts',
      cursor: null,
      runId: run.runId,
    })
    const before = listed.page[0]!
    const after = structuredClone(before)
    after.locales.en!.values.title = 'After'
    const batch = {
      runId: run.runId,
      cursor: String(entryId),
      entries: [
        {
          inputHash: await hashCanonicalJson(before),
          outputHash: await hashCanonicalJson(after),
          entry: after,
        },
      ],
    }

    await expect(
      ctx.raw.mutation(api.migrations.applyContentMigrationBatch, batch),
    ).resolves.toEqual({ changed: 1, skipped: 0 })
    expect(await ctx.readAll('contentMigrationRuns')).toEqual([
      expect.objectContaining({ status: 'applying', cursor: String(entryId) }),
    ])
    expect(await ctx.readAll('contentMigrationEntryReceipts')).toEqual([
      expect.objectContaining({
        entryId,
        inputHash: batch.entries[0]!.inputHash,
        outputHash: batch.entries[0]!.outputHash,
        appliedDraftVersion: 2,
      }),
    ])
    await expect(
      ctx.raw.mutation(api.migrations.applyContentMigrationBatch, batch),
    ).resolves.toEqual({ changed: 0, skipped: 1 })
    await expect(
      ctx.raw.query(api.migrations.listContentMigrationEntries, {
        collection: 'posts',
        cursor: null,
        runId: run.runId,
      }),
    ).resolves.toMatchObject({ page: [], isDone: true, continueCursor: null })

    await ctx.raw.run(async (inner) => {
      const entry = await inner.db.get(entryId as never)
      const draft = await inner.db
        .query('entryDrafts')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', entryId as never).eq('locale', 'en'),
        )
        .first()
      await inner.db.patch(entry!._id, { draftVersion: 3 })
      await inner.db.patch(draft!._id, { values: { title: 'User edit' } })
    })

    await expect(
      ctx.raw.mutation(api.migrations.applyContentMigrationBatch, batch),
    ).rejects.toThrow(/changed after migration/i)
  })

  it('validates and consumes one exact contract-transition approval', async () => {
    const ctx = createCtx()
    await seedMigrationEntry(ctx)
    const target = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/posts',
            i18n: true,
          },
        },
      },
      { defaultLocale: 'en', locales: ['en', 'de'] },
    )
    target.collections.posts!.fields[0]!.required = true
    const targetHash = await hashCanonicalJson(target)
    const run = await ctx.raw.mutation(api.migrations.beginContentMigration, {
      migrationId: 'require-title',
      sourceHash: 'source-a',
      toContractHash: targetHash,
    })

    await expect(
      ctx.raw.mutation(api.migrations.finalizeContentMigration, {
        runId: run.runId,
        contract: target,
        contractSha256: targetHash,
        publicStrategy: 'rebuild',
      }),
    ).resolves.toMatchObject({ validatedEntryCount: 1, toContractHash: targetHash })
    await expect(
      ctx.raw.mutation(api.migrations.activateContentMigration, {
        runId: run.runId,
        contract: target,
        contractSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow(/target|hash/i)
    await expect(
      ctx.raw.mutation(api.migrations.activateContentMigration, {
        runId: run.runId,
        contract: target,
        contractSha256: targetHash,
      }),
    ).resolves.toMatchObject({ status: 'activated', contractSha256: targetHash })
    expect(await ctx.readAll('contractTransitionApprovals')).toEqual([
      expect.objectContaining({ consumedAt: expect.any(Number) }),
    ])
    await expect(
      ctx.raw.mutation(api.migrations.activateContentMigration, {
        runId: run.runId,
        contract: target,
        contractSha256: targetHash,
      }),
    ).rejects.toThrow(/consumed|status/i)
  })

  it('invalidates finalization when an entry changes before activation', async () => {
    const ctx = createCtx()
    const { entryId } = await seedMigrationEntry(ctx)
    const target = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/posts',
            i18n: true,
          },
        },
      },
      { defaultLocale: 'en', locales: ['en', 'de'] },
    )
    const targetHash = await hashCanonicalJson(target)
    const run = await ctx.raw.mutation(api.migrations.beginContentMigration, {
      migrationId: 'validate-once',
      sourceHash: 'source-a',
      toContractHash: targetHash,
    })
    await ctx.raw.mutation(api.migrations.finalizeContentMigration, {
      runId: run.runId,
      contract: target,
      contractSha256: targetHash,
      publicStrategy: 'rebuild',
    })
    await ctx.raw.run(async (inner) => {
      const entry = await inner.db.get(entryId as never)
      await inner.db.patch(entry!._id, { draftVersion: 2 })
    })

    await expect(
      ctx.raw.mutation(api.migrations.activateContentMigration, {
        runId: run.runId,
        contract: target,
        contractSha256: targetHash,
      }),
    ).rejects.toThrow(/changed after validation/i)
  })
})
