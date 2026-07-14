import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember, seedOwner } from '../helpers'
import { publishEntry, seedEditorFixture, seedSettings, seedTreeFixture } from './entries/helpers'

const api = anyApi

async function asEditorAgent(ctx: ReturnType<typeof createCtx>, userId = 'editor-1') {
  const apiKeyId = `ba_key_${userId}`
  await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
    apiKeyId,
    ownerUserId: userId,
    scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
  })
  return ctx.asMcpApiKey(apiKeyId, userId)
}

describe('component: review requests', () => {
  it('creates review requests without changing public output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const beforePublicRows = await ctx.readAll('publicEntries')

    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    expect(review).toMatchObject({
      agentRunId: run._id,
      operationId: 'ginko-cms.publish-entry',
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      status: 'pending',
      requestedBy: 'editor-1',
      reviewedBy: null,
      preview: expect.objectContaining({
        kind: 'publish-review-preview',
        status: 'ready',
        locales: [expect.objectContaining({ locale: 'en', status: 'ready' })],
      }),
      reviewSummary: {
        status: 'ready',
        localeStatuses: [
          expect.objectContaining({
            locale: 'en',
            status: 'ready',
          }),
        ],
        affectedPublicUrls: [
          expect.objectContaining({
            locale: 'en',
            entryId,
            scope: 'current_entry',
            afterHref: '/posts/hello-world',
          }),
        ],
        changeCount: expect.any(Number),
        blockerCount: 0,
        warningCount: 0,
        blockingIssueCodes: [],
        warningIssueCodes: [],
      },
      versionHash: expect.any(String),
    })
    expect(JSON.stringify(review.preview)).not.toContain('effects')
    expect(await ctx.readAll('publicEntries')).toEqual(beforePublicRows)
  })

  it('creates human review requests without an agent run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = ctx.asCmsUser('editor-1')
    const publisher = ctx.asCmsUser('publisher-1')
    const beforePublicRows = await ctx.readAll('publicEntries')

    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Human publish review',
      summary: 'Editor requests publisher approval from Studio.',
    })

    expect(review).toMatchObject({
      agentRunId: null,
      requestSource: 'human',
      operationId: 'ginko-cms.publish-entry',
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      status: 'pending',
      requestedBy: 'editor-1',
      reviewedBy: null,
      reviewSummary: expect.objectContaining({
        status: 'ready',
        blockerCount: 0,
      }),
    })
    expect(await ctx.readAll('publicEntries')).toEqual(beforePublicRows)
    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        agentRunId: null,
        requestSource: 'human',
      }),
    ])
  })

  it('includes descendant URL movement in publish review summaries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { rootAId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const editor = await asEditorAgent(ctx)

    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    const root = await editor.query(api.editor.getEntry, { id: rootAId, locale: 'en' })
    await editor.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: root.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })
    const updatedRoot = await editor.query(api.editor.getEntry, { id: rootAId, locale: 'en' })
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare parent route publish',
    })

    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId: rootAId,
      expectedVersion: updatedRoot.draftVersion,
      locales: ['en'],
      title: 'Publish parent route',
      summary: 'Move the parent route and descendants.',
    })

    expect(review.reviewSummary.affectedPublicUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: rootAId,
          scope: 'current_entry',
          label: 'Public route',
          beforeHref: '/docs/root-a',
          afterHref: '/docs/root-renamed',
        }),
        expect.objectContaining({
          entryId: childId,
          scope: 'descendant',
          beforeHref: '/docs/root-a/child',
          afterHref: '/docs/root-renamed/child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          scope: 'descendant',
          beforeHref: '/docs/root-a/child/grandchild',
          afterHref: '/docs/root-renamed/child/grandchild',
        }),
      ]),
    )
  })

  it('rejects caller-provided preview and version hash during review creation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Spoof review',
    })

    await expect(
      editor.mutation(api.reviewRequests.requestPublishReview, {
        agentRunId: run._id,
        entryId,
        expectedVersion: 1,
        locales: ['en'],
        title: 'Spoof publish review',
        summary: 'Caller tries to provide preview truth.',
        preview: { kind: 'spoofed', status: 'ready', effects: ['publish everything'] },
        versionHash: 'caller-controlled',
      }),
    ).rejects.toThrow()
    expect(await ctx.readAll('reviewRequests')).toEqual([])
  })

  it('rejects stale expectedVersion during review creation before writing review activity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Stale review',
    })
    await editor.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Changed before review request' },
          },
        },
      },
    })
    const activityBefore = await ctx.readAll('activity')

    await expect(
      editor.mutation(api.reviewRequests.requestPublishReview, {
        agentRunId: run._id,
        entryId,
        expectedVersion: 1,
        locales: ['en'],
        title: 'Stale publish review',
        summary: 'This should be rejected.',
      }),
    ).rejects.toThrow('This entry changed in another session.')

    expect(await ctx.readAll('reviewRequests')).toEqual([])
    expect(await ctx.readAll('activity')).toEqual(activityBefore)
  })

  it('approves pending publish reviews through the canonical publish path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const viewer = ctx.asCmsUser('viewer-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    await expect(
      editor.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('Forbidden: Publish entries')
    await expect(
      viewer.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('Forbidden: Publish entries')

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: 'stale',
      }),
    ).rejects.toThrow('This review is out of date. Ask for a new review.')

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).resolves.toMatchObject({
      status: 'approved',
      reviewedBy: 'publisher-1',
    })
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({
        entryId,
        locale: 'en',
      }),
    ])
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reviewRequest.approved',
          appIdentityId: 'publisher-1',
          detail: expect.objectContaining({
            reviewRequestId: review._id,
            operationId: 'ginko-cms.publish-entry',
            locales: ['en'],
            versionHash: review.versionHash,
            previewHash: expect.stringMatching(/^preview:/),
            result: expect.objectContaining({
              affectedLocales: ['en'],
            }),
          }),
        }),
      ]),
    )

    const secondReview = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world again',
      summary: 'Ready for publisher review.',
    })

    const publicRowsBeforeReject = await ctx.readAll('publicEntries')
    await expect(
      publisher.mutation(api.reviewRequests.rejectReview, {
        reviewRequestId: secondReview._id,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reviewedBy: 'publisher-1',
    })
    expect(await ctx.readAll('publicEntries')).toEqual(publicRowsBeforeReject)
  })

  it('rejects approval when the draft changed after review creation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    await editor.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Changed after review' },
          },
        },
      },
    })

    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        isStale: true,
        staleReason: 'This review is out of date. Ask for a new review.',
      }),
    ])

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('This review is out of date. Ask for a new review.')
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('rejects approval when public route context changed after review creation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { rootAId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')

    await publishEntry(owner, rootAId)
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare child publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId: childId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish child page',
      summary: 'Ready for publisher review.',
    })
    expect(review.reviewSummary.affectedPublicUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          afterHref: '/docs/root-a/child',
        }),
      ]),
    )

    const root = await owner.query(api.editor.getEntry, { id: rootAId, locale: 'en' })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: root.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })
    await publishEntry(owner, rootAId)

    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        isStale: false,
        staleReason: null,
      }),
    ])
    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('This review is out of date. Ask for a new review.')
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({
        entryId: rootAId,
        path: '/docs/root-renamed',
      }),
    ])
  })

  it('rejects approval when current backend preview is blocked even if version is unchanged', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(
        collectionId as never,
        {
          fields: [
            { key: 'title', type: 'text', localized: true, required: true, searchable: true },
            { key: 'hero', type: 'image', localized: false },
            {
              key: 'description',
              type: 'textarea',
              localized: true,
              searchable: true,
            },
          ],
        } as never,
      )
      const draft = await innerCtx.db
        .query('entryDrafts' as never)
        .withIndex('by_entry_locale' as never, (q) =>
          q.eq('entryId' as never, entryId as never).eq('locale' as never, 'en' as never),
        )
        .first()
      if (!draft) throw new Error('Missing locale draft fixture.')
      await innerCtx.db.patch(draft._id, { values: {} } as never)
    })

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('This review is out of date. Ask for a new review.')
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('fails closed for pending reviews without an exact preview hash', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    await ctx.raw.run(async (innerCtx) => {
      const row = await innerCtx.db.get(review._id as never)
      if (!row) throw new Error('Missing review request fixture.')
      const { previewHash: _previewHash, ...legacyRow } = row as Record<string, unknown>
      await innerCtx.db.replace(review._id as never, legacyRow as never)
    })

    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        isStale: true,
        staleReason: 'Review request must be recreated because its publish preview is outdated.',
      }),
    ])
    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('Review request must be recreated')
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('normalizes legacy review preview rows as stale instead of exposing raw JSON', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Publish hello world',
      summary: 'Ready for publisher review.',
    })

    await ctx.raw.run(async (innerCtx) => {
      const row = await innerCtx.db.get(review._id as never)
      if (!row) throw new Error('Missing review request fixture.')
      const { previewHash: _previewHash, ...legacyRow } = row as Record<string, unknown>
      await innerCtx.db.replace(
        review._id as never,
        {
          ...legacyRow,
          preview: {
            effects: [{ label: 'old client-computed preview' }],
          },
        } as never,
      )
    })

    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        isStale: true,
        staleReason: 'Review request must be recreated because its publish preview is outdated.',
        preview: expect.objectContaining({
          kind: 'publish-review-preview',
          status: 'blocked',
          blockingIssueCodes: ['outdated_review_preview'],
        }),
        reviewSummary: expect.objectContaining({
          status: 'blocked',
          blockerCount: 1,
          blockingIssueCodes: ['outdated_review_preview'],
        }),
      }),
    ])
    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow('Review request must be recreated')
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('lists pending reviews for publishers only', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = await asEditorAgent(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Prepare publish',
    })
    const first = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'First publish request',
      summary: 'Ready for publisher review.',
    })
    const second = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Second publish request',
      summary: 'Ready for publisher review.',
    })
    await publisher.mutation(api.reviewRequests.rejectReview, {
      reviewRequestId: first._id,
    })

    await expect(
      editor.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).rejects.toThrow('Forbidden: Publish entries')
    await expect(
      publisher.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: second._id,
        status: 'pending',
        reviewSummary: expect.objectContaining({
          status: 'ready',
          localeStatuses: [expect.objectContaining({ locale: 'en', status: 'ready' })],
        }),
      }),
    ])
    await expect(
      owner.query(api.reviewRequests.listPendingReviews, { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: second._id,
        status: 'pending',
      }),
    ])
  })

  it('rejects review creation after an agent run is closed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const editor = await asEditorAgent(ctx)
    const run = await editor.mutation(api.agentRuns.startRun, {
      taskName: 'Closed run',
    })
    await editor.mutation(api.agentRuns.completeRun, { agentRunId: run._id })

    await expect(
      editor.mutation(api.reviewRequests.requestPublishReview, {
        agentRunId: run._id,
        entryId: 'entry-1',
        expectedVersion: 1,
        locales: ['en'],
        title: 'Cannot create',
        summary: 'Run is closed.',
      }),
    ).rejects.toThrow('Agent run is not active.')
  })

  it('rejects review creation for another member run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'editor-2', role: 'editor' })

    const firstEditor = await asEditorAgent(ctx)
    const secondEditor = ctx.asCmsUser('editor-2')
    const run = await firstEditor.mutation(api.agentRuns.startRun, {
      taskName: 'First editor run',
    })

    await expect(
      secondEditor.mutation(api.reviewRequests.requestPublishReview, {
        agentRunId: run._id,
        entryId: 'entry-1',
        expectedVersion: 1,
        locales: ['en'],
        title: 'Cannot create',
        summary: 'Wrong run.',
      }),
    ).rejects.toThrow('Agent run belongs to a different user.')
  })

  it('lets only the requesting MCP credential inspect review status, including after run completion', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    for (const apiKeyId of ['ba_key_editor', 'ba_key_other']) {
      await ctx.seed('mcpCredentialSettings', {
        apiKeyId,
        ownerUserId: 'editor-1',
        scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
        status: 'active',
        createdBy: 'owner-1',
        createdAt: Date.now(),
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
        revokedAt: null,
      })
    }
    const editorAgent = ctx.asMcpApiKey('ba_key_editor', 'editor-1')
    const run = await editorAgent.mutation(api.agentRuns.startRun, { taskName: 'Request review' })
    const review = await editorAgent.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Agent publish request',
      summary: 'Ready for review.',
    })
    await editorAgent.mutation(api.agentRuns.completeRun, { agentRunId: run._id })

    await expect(
      editorAgent.query(api.reviewRequests.getOwnReviewRequest, {
        reviewRequestId: review._id,
      }),
    ).resolves.toMatchObject({ _id: review._id, agentRunId: run._id, status: 'pending' })
    await expect(
      ctx
        .asMcpApiKey('ba_key_other', 'editor-1')
        .query(api.reviewRequests.getOwnReviewRequest, { reviewRequestId: review._id }),
    ).rejects.toThrow('Agent run belongs to a different MCP credential.')
  })
})
