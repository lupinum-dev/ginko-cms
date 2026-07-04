import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember, seedOwner } from '../helpers'
import { seedEditorFixture, seedSettings } from './entries/helpers'

const api = anyApi

describe('component: review requests', () => {
  it('creates review requests without changing public output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = ctx.asCmsUser('editor-1')
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
      preview: { allowed: true, effects: [] },
      versionHash: 'draft-v1',
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
    })
    expect(await ctx.readAll('publicEntries')).toEqual(beforePublicRows)
  })

  it('approves pending publish reviews through the canonical publish path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = ctx.asCmsUser('editor-1')
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
      preview: { allowed: true, effects: [] },
      versionHash: 'draft-v1',
    })

    await expect(
      editor.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: 'draft-v1',
      }),
    ).rejects.toThrow('Forbidden: Publish entries')

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: 'stale',
      }),
    ).rejects.toThrow('Review request is stale.')

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: 'draft-v1',
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
      preview: { allowed: true, effects: [] },
      versionHash: 'draft-v1',
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

  it('lists pending reviews for publishers only', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const editor = ctx.asCmsUser('editor-1')
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
      preview: { allowed: true, effects: [] },
      versionHash: 'draft-v1',
    })
    const second = await editor.mutation(api.reviewRequests.requestPublishReview, {
      agentRunId: run._id,
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Second publish request',
      summary: 'Ready for publisher review.',
      preview: { allowed: true, effects: [] },
      versionHash: 'draft-v1',
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
      }),
    ])
  })

  it('rejects review creation after an agent run is closed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const editor = ctx.asCmsUser('editor-1')
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
        preview: {},
      }),
    ).rejects.toThrow('Agent run is not active.')
  })

  it('rejects review creation for another member run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'editor-2', role: 'editor' })

    const firstEditor = ctx.asCmsUser('editor-1')
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
        preview: {},
      }),
    ).rejects.toThrow('Agent run belongs to a different user.')
  })
})
