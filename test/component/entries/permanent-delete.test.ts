/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  archiveEntry,
  createCtx,
  permanentlyDeleteEntry,
  previewPermanentlyDeleteEntry,
  publishEntry,
  seedEditorFixture,
  seedMember,
  seedOwner,
  seedSettings,
  seedStorageObject,
  seedTreeFixture,
} from './helpers'

const api = anyApi

async function entryRecord(ctx: ReturnType<typeof createCtx>, entryId: string) {
  const entry = (await ctx.readAll('entries')).find((row) => String(row._id) === entryId)
  if (!entry) throw new Error(`Missing entry ${entryId}.`)
  return entry
}

async function deleteArgs(ctx: ReturnType<typeof createCtx>, entryId: string) {
  const entry = await entryRecord(ctx, entryId)
  return { entryId, confirmationPhrase: `DELETE ${entry.stableId}` }
}

async function seedRetainedPortableItem(
  ctx: ReturnType<typeof createCtx>,
  input: { entryId: string; collection: string; stableId: string; expiresAt: number },
) {
  const now = Date.now()
  const contract = (await ctx.readAll('cmsContract'))[0]!
  await ctx.seed('portableRuns', {
    runId: 'delete-retention-run',
    planId: 'delete-retention-plan',
    mode: 'import',
    state: 'planned',
    payload: {},
    payloadSha256: 'payload-sha',
    callerId: 'owner-1',
    deploymentId: 'test',
    scope: { collections: [input.collection] },
    targetContentHash: contract.contentHash,
    sourceManifestSha256: 'manifest-sha',
    sourceContentHash: contract.contentHash,
    stagedItemCount: 1,
    stagedAssetCount: 0,
    stagedLocales: ['en'],
    workPhase: null,
    workCursor: null,
    workGeneration: 0,
    workToken: null,
    workLeaseExpiresAt: null,
    workAttempts: 0,
    workNextAttemptAt: null,
    workLastError: null,
    workDeadLetteredAt: null,
    sealItemCount: 1,
    sealItemHash: { words: [], block: [], bytesHashed: 0 },
    sealAssetCount: 0,
    sealAssetHash: { words: [], block: [], bytesHashed: 0 },
    committedItemCount: 0,
    attachedAssetCount: 0,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  })
  await ctx.seed('portableItems', {
    mode: 'import',
    runId: 'delete-retention-run',
    index: 0,
    itemKey: 'delete-retention-item',
    inputSha256: 'item-sha',
    payload: {},
    document: {},
    collection: input.collection,
    canonicalKey: input.stableId,
    locale: 'en',
    revisionId: null,
    state: 'staged',
    effect: null,
    resultId: input.entryId,
    committedAt: null,
  })
}

describe('LIF-03 permanent entry deletion', () => {
  it('is owner-only, archived-first, and bound to the explicit stable-id phrase', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const args = await deleteArgs(ctx, entryId)

    await expect(
      ctx
        .asCmsUser('publisher-1')
        .mutation(api.entries.permanentDelete.previewPermanentlyDeleteEntryOperation, args),
    ).rejects.toThrow('Forbidden: Delete entries')
    await expect(
      ctx
        .asCmsUser('editor-1')
        .mutation(api.entries.permanentDelete.previewPermanentlyDeleteEntryOperation, args),
    ).rejects.toThrow('Forbidden: Delete entries')
    await expect(
      ctx
        .asCmsUser('viewer-1')
        .mutation(api.entries.permanentDelete.previewPermanentlyDeleteEntryOperation, args),
    ).rejects.toThrow('Forbidden: Delete entries')

    await expect(
      previewPermanentlyDeleteEntry(ctx.asCmsUser('owner-1'), args),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: expect.arrayContaining([expect.objectContaining({ code: 'entry-not-archived' })]),
    })

    await archiveEntry(ctx.asCmsUser('owner-1'), entryId)
    const wrongPhrase = await previewPermanentlyDeleteEntry(ctx.asCmsUser('owner-1'), {
      ...args,
      confirmationPhrase: 'DELETE something-else',
    })
    expect(wrongPhrase).toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'confirmation-phrase-mismatch' }),
      ]),
    })
    await expect(
      previewPermanentlyDeleteEntry(ctx.asCmsUser('owner-1'), args),
    ).resolves.toMatchObject({
      allowed: true,
      confirmation: { token: expect.any(String) },
      details: expect.objectContaining({
        expectedPhrase: args.confirmationPhrase,
        retainedOperationReceipt: true,
      }),
    })
  })

  it('atomically removes canonical and derived content while retaining minimal audit receipts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    await archiveEntry(owner, entryId)
    const args = await deleteArgs(ctx, entryId)

    const first = await permanentlyDeleteEntry(owner, args)
    expect(first).toMatchObject({
      entryId,
      collection: 'posts',
      deleted: true,
      alreadyDeleted: false,
    })
    for (const table of [
      'entries',
      'entryLocaleDrafts',
      'draftSearchEntries',
      'entryRevisions',
      'publicEntries',
      'publicSearchEntries',
      'contentAssetRefs',
      'reviewRequests',
      'mcpCreateEntryReceipts',
    ]) {
      expect(await ctx.readAll(table), table).toEqual([])
    }
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'entry.deleted',
          entryId: null,
          subjectKey: entryId,
          collection: 'posts',
          detail: expect.objectContaining({
            entryId,
            collection: 'posts',
            stableId: first.stableId,
            retainedOperationReceipt: true,
          }),
        }),
      ]),
    )
    expect((await ctx.readAll('activity')).every((row) => row.entryId === null)).toBe(true)
    expect(await ctx.readAll('destructiveAuditLog')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'ginko-cms.permanently-delete-entry',
          status: 'applied',
        }),
      ]),
    )
    expect(await ctx.readAll('outboxEvents')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: `content.revalidate:delete:${entryId}`,
          payload: expect.objectContaining({ reason: 'delete', entryId }),
        }),
      ]),
    )

    const repeated = await permanentlyDeleteEntry(owner, args)
    expect(repeated).toEqual({
      ...first,
      deleted: false,
      alreadyDeleted: true,
    })
    expect(
      (await ctx.readAll('activity')).filter((row) => row.kind === 'entry.deleted'),
    ).toHaveLength(1)
    await ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, {
      now: Date.now() + 181 * 24 * 60 * 60_000,
    })
    expect(await ctx.readAll('activity')).toEqual([
      expect.objectContaining({
        kind: 'entry.deleted',
        retention: 'legal',
        subjectKey: entryId,
      }),
    ])
    await expect(permanentlyDeleteEntry(owner, args)).resolves.toMatchObject({
      deleted: false,
      alreadyDeleted: true,
    })
    await expect(
      previewPermanentlyDeleteEntry(owner, {
        entryId: 'not-a-known-entry',
        confirmationPhrase: 'DELETE unknown',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_NOT_FOUND', status: 'stale' })],
    })
  })

  it('blocks current inbound relations and editorial descendants', async () => {
    const relationCtx = createCtx()
    await seedOwner(relationCtx)
    await seedSettings(relationCtx)
    const owner = relationCtx.asCmsUser('owner-1')
    const authorId = await owner.createEntry({
      collection: 'authors',
      slug: 'ada',
      localized: { name: 'Ada' },
    })
    const author = await entryRecord(relationCtx, authorId)
    await owner.createEntry({
      collection: 'posts',
      slug: 'related-post',
      shared: { author: author.stableId },
      localized: { title: 'Related' },
    })
    await relationCtx.raw.run(async (inner) => {
      const id = inner.db.normalizeId('entries', authorId)
      if (!id) throw new Error('Expected author id.')
      await inner.db.patch(id, { lifecycle: 'archived' })
    })
    await expect(
      previewPermanentlyDeleteEntry(owner, await deleteArgs(relationCtx, authorId)),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'entry-has-inbound-relations' }),
      ]),
      details: expect.objectContaining({
        inboundRelations: expect.objectContaining({ total: 1 }),
      }),
    })

    const treeCtx = createCtx()
    await seedOwner(treeCtx)
    await seedSettings(treeCtx)
    const tree = await seedTreeFixture(treeCtx)
    await archiveEntry(treeCtx.asCmsUser('owner-1'), tree.rootAId)
    await expect(
      previewPermanentlyDeleteEntry(
        treeCtx.asCmsUser('owner-1'),
        await deleteArgs(treeCtx, tree.rootAId),
      ),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'entry-has-children', count: 2 }),
      ]),
    })
  })

  it('blocks public remnants, scoped assets, active redirects, and pending reviews', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    const entry = await entryRecord(ctx, entryId)
    const storageId = await seedStorageObject(ctx, { bytes: 'entry-asset', type: 'image/png' })
    await ctx.seed('assets', {
      storageId,
      filename: 'entry.png',
      mimeType: 'image/png',
      size: 11,
      sha256: '1'.repeat(64),
      width: 1,
      height: 1,
      frames: 1,
      scope: 'entry',
      entryId,
      collection: 'posts',
      createdBy: 'owner-1',
      createdAt: Date.now(),
    })
    await ctx.seed('redirects', {
      redirectId: 'entry-delete-redirect',
      collection: 'posts',
      locale: 'en',
      kind: 'exact',
      fromPath: '/posts/old',
      targetEntryId: entryId,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: 'test',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      retiredBy: null,
      retiredAt: null,
      updatedAt: Date.now(),
    })
    await ctx.seed('reviewRequests', {
      agentRunId: null,
      entryId,
      locales: ['en'],
      expectedVersion: entry.draftVersion,
      message: null,
      title: 'Pending deletion fence',
      summary: 'Pending',
      status: 'pending',
      preview: {},
      requestedBy: 'owner-1',
      reviewedBy: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reviewedAt: null,
      reviewFeedback: null,
      versionHash: null,
      previewHash: 'preview',
    })
    await ctx.raw.run(async (inner) => {
      const id = inner.db.normalizeId('entries', entryId)
      if (!id) throw new Error('Expected entry id.')
      await inner.db.patch(id, { lifecycle: 'archived' })
    })

    const preview = await previewPermanentlyDeleteEntry(owner, await deleteArgs(ctx, entryId))
    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining(
        [
          'entry-has-public-remnants',
          'entry-has-scoped-assets',
          'entry-has-active-redirects',
          'entry-has-pending-reviews',
        ].map((code) => expect.objectContaining({ code })),
      ),
    )
  })

  it('recomputes blockers after preview and leaves every content row intact on stale execution', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await archiveEntry(owner, entryId)
    const args = await deleteArgs(ctx, entryId)
    const preview = await previewPermanentlyDeleteEntry(owner, args)
    expect(preview.confirmation).not.toBeNull()
    const before = {
      entries: structuredClone(await ctx.readAll('entries')),
      drafts: structuredClone(await ctx.readAll('entryLocaleDrafts')),
      revisions: structuredClone(await ctx.readAll('entryRevisions')),
    }
    await ctx.raw.run(async (inner) => {
      const id = inner.db.normalizeId('entries', entryId)
      const row = id ? await inner.db.get(id) : null
      if (!row) throw new Error('Expected entry.')
      await inner.db.patch(row._id, { updatedAt: row.updatedAt + 1 })
    })

    await expect(
      owner.mutation(api.entries.permanentDelete.permanentlyDeleteEntryOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'CONFIRMATION_VERSION_MISMATCH' })
    expect((await ctx.readAll('entries')).map(({ updatedAt: _updatedAt, ...row }) => row)).toEqual(
      before.entries.map(({ updatedAt: _updatedAt, ...row }) => row),
    )
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before.drafts)
    expect(await ctx.readAll('entryRevisions')).toEqual(before.revisions)
    expect(await ctx.readAll('activity')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'entry.deleted' })]),
    )
  })

  it('blocks unexpired portability retention and purges expired item content with deletion', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await archiveEntry(owner, entryId)
    const entry = await entryRecord(ctx, entryId)
    const args = await deleteArgs(ctx, entryId)
    await seedRetainedPortableItem(ctx, {
      entryId,
      collection: entry.collection,
      stableId: entry.stableId,
      expiresAt: Date.now() + 60_000,
    })

    await expect(previewPermanentlyDeleteEntry(owner, args)).resolves.toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'entry-retained-by-portability' }),
      ]),
    })
    await ctx.raw.run(async (inner) => {
      const run = await inner.db.query('portableRuns').first()
      if (!run) throw new Error('Expected portability run.')
      await inner.db.patch(run._id, { expiresAt: Date.now() - 1 })
    })
    await expect(permanentlyDeleteEntry(owner, args)).resolves.toMatchObject({ deleted: true })
    expect(await ctx.readAll('portableItems')).toEqual([])
  })

  it('blocks active contract-transition content and removes terminal staged payloads', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await archiveEntry(owner, entryId)
    const entry = await entryRecord(ctx, entryId)
    const contract = (await ctx.readAll('cmsContract'))[0]!
    const now = Date.now()
    const runId = await ctx.seed('contractTransitionRuns', {
      runKey: 'delete-retention-transition',
      fromContentHash: contract.contentHash,
      toContentHash: contract.contentHash,
      fromPresentationHash: contract.presentationHash,
      toPresentationHash: contract.presentationHash,
      affectedCollections: [entry.collection],
      targetContent: contract.content,
      targetPresentation: contract.presentation,
      state: 'staging',
      generation: 1,
      cursor: null,
      scannedCount: 1,
      stagedCount: 1,
      validatedCount: 0,
      appliedCount: 0,
      stagedHash: 'staged',
      validatedHash: 'validated',
      createdBy: 'owner-1',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.seed('contractTransitionItems', {
      runId,
      entryId,
      sequence: 0,
      collection: entry.collection,
      stableId: entry.stableId,
      parentEntryId: entry.parentEntryId,
      inputDraftVersion: entry.draftVersion,
      inputHash: 'input',
      outputHash: 'output',
      routeClaimsHash: 'routes',
      output: { retained: 'staged content' },
      state: 'staged',
      validatedAt: null,
      appliedAt: null,
    })
    const args = await deleteArgs(ctx, entryId)

    await expect(previewPermanentlyDeleteEntry(owner, args)).resolves.toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: 'entry-retained-by-contract-transition' }),
      ]),
    })
    await ctx.raw.run(async (inner) => {
      const id = inner.db.normalizeId('contractTransitionRuns', String(runId))
      if (!id) throw new Error('Expected transition run id.')
      await inner.db.patch(id, { state: 'cancelled', updatedAt: Date.now() })
    })
    await expect(permanentlyDeleteEntry(owner, args)).resolves.toMatchObject({ deleted: true })
    expect(await ctx.readAll('contractTransitionItems')).toEqual([])
  })
})
