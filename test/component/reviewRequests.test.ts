/// <reference types="vite/client" />

import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMcpDelegation, seedMember, seedOwner } from '../helpers'
import {
  currentDraftVersion,
  publishEntry,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedSettings,
} from './entries/helpers'

const api = anyApi

async function createEditorAgent(ctx: ReturnType<typeof createCtx>) {
  await seedMcpDelegation(ctx, {
    oauthClientId: 'client-editor',
    ownerUserId: 'editor-1',
    scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
  })
  return ctx.asMcpOAuth('client-editor', 'editor-1')
}

async function requestAgentReview(
  agent: ReturnType<ReturnType<typeof createCtx>['asMcpOAuth']>,
  args: { runId: string; entryId: string; expectedVersion: number; title: string },
) {
  return await agent.mutation(api.reviewRequests.requestPublishReview, {
    agentRunId: args.runId,
    operationKey: crypto.randomUUID(),
    entryId: args.entryId,
    expectedVersion: args.expectedVersion,
    locales: ['en'],
    title: args.title,
    summary: 'Ready for a publisher decision.',
  })
}

async function requestAgentReviewWithOperationKey(
  agent: ReturnType<ReturnType<typeof createCtx>['asMcpOAuth']>,
  args: {
    operationKey: string
    runId: string
    entryId: string
    expectedVersion: number
    title: string
  },
) {
  return await agent.mutation(api.reviewRequests.requestPublishReview, {
    agentRunId: args.runId,
    operationKey: args.operationKey,
    entryId: args.entryId,
    expectedVersion: args.expectedVersion,
    locales: ['en'],
    title: args.title,
    summary: 'Ready for a publisher decision.',
  })
}

describe('canonical publish reviews', () => {
  it('uses the host-forwarded caller instead of a component transport identity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const review = await owner.mutation(api.reviewRequests.requestPublishReview, {
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Forwarded publisher identity',
      summary: 'The host facade resolved the publisher.',
    })

    const componentTransport = ctx.asCmsUser('component-transport-subject')
    await expect(
      componentTransport.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
        _trustedCaller: cmsUserCaller('publisher-1'),
      }),
    ).resolves.toMatchObject({ status: 'approved', reviewedBy: 'publisher-1' })
  })

  it('stores one sorted locale set and authorizes that canonical publish scope', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { locales: { de: { values: { title: 'Hallo Welt' } } } },
    })
    const expectedVersion = await currentDraftVersion(owner, entryId)
    const review = await owner.mutation(api.reviewRequests.requestPublishReview, {
      entryId,
      expectedVersion,
      locales: ['de', 'en', 'de'],
      title: 'Canonical locales',
      summary: 'Publish each locale once.',
    })
    expect(review.locales).toEqual(['de', 'en'])

    await expect(
      owner.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).resolves.toMatchObject({ status: 'approved', locales: ['de', 'en'] })
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId, locale: 'de' }),
        expect.objectContaining({ entryId, locale: 'en' }),
      ]),
    )
  })

  it('keeps reviewer policy application-owned and serializes competing publisher decisions', async () => {
    async function approveAs(reviewerId: 'publisher-1' | 'publisher-2') {
      const ctx = createCtx()
      await seedOwner(ctx)
      await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
      await seedMember(ctx, { userId: 'publisher-2', role: 'publisher' })
      await seedSettings(ctx)
      const { entryId } = await seedEditorFixture(ctx)
      const requester = ctx.asCmsUser('publisher-1')
      const review = await requester.mutation(api.reviewRequests.requestPublishReview, {
        entryId,
        expectedVersion: 1,
        locales: ['en'],
        title: 'Application-owned reviewer policy',
        summary: 'The current publisher policy chooses who may decide.',
      })

      const approved = await ctx.asCmsUser(reviewerId).mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      })

      expect(approved).toMatchObject({
        _id: review._id,
        status: 'approved',
        reviewedBy: reviewerId,
      })
    }

    await approveAs('publisher-1')
    await approveAs('publisher-2')

    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'publisher-2', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const review = await ctx
      .asCmsUser('publisher-1')
      .mutation(api.reviewRequests.requestPublishReview, {
        entryId,
        expectedVersion: 1,
        locales: ['en'],
        title: 'Competing publisher decisions',
        summary: 'Only one current publisher decision may commit.',
      })
    const decide = (reviewerId: 'publisher-1' | 'publisher-2') =>
      ctx.asCmsUser(reviewerId).mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      })

    const decisions = await Promise.allSettled([decide('publisher-1'), decide('publisher-2')])
    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1)
    expect(decisions.filter((decision) => decision.status === 'rejected')).toHaveLength(1)
    expect(await ctx.readAll('entryRevisions')).toHaveLength(1)
    expect(await ctx.readAll('publicEntries')).toHaveLength(1)
    expect(await ctx.readAll('destructiveAuditLog')).toHaveLength(1)
    expect(await ctx.readAll('reviewRequests')).toEqual([
      expect.objectContaining({
        _id: review._id,
        status: 'approved',
        reviewedBy: expect.stringMatching(/^publisher-[12]$/),
      }),
    ])

    const downgraded = createCtx()
    await seedOwner(downgraded)
    await seedMember(downgraded, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(downgraded)
    const downgradedEntry = await seedEditorFixture(downgraded)
    const downgradedPublisher = downgraded.asCmsUser('publisher-1')
    const pending = await downgradedPublisher.mutation(api.reviewRequests.requestPublishReview, {
      entryId: downgradedEntry.entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Reviewer authority changed',
      summary: 'Current authority must be checked at decision time.',
    })
    const publisherMember = (await downgraded.readAll('members')).find(
      (member) => member.userId === 'publisher-1',
    )
    if (!publisherMember) throw new Error('Publisher member fixture is missing.')
    await downgraded.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(publisherMember._id, { role: 'viewer' })
    })
    await expect(
      downgradedPublisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: pending._id,
        expectedVersionHash: pending.versionHash,
      }),
    ).rejects.toThrow(/Publish entries/i)
    expect(await downgraded.readAll('publicEntries')).toEqual([])
  })

  it('requires an owned active agent run for MCP review requests', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await createEditorAgent(ctx)

    await expect(
      agent.mutation(api.reviewRequests.requestPublishReview, {
        entryId,
        expectedVersion: 1,
        locales: ['en'],
        title: 'Missing run',
        summary: 'This must be rejected.',
      }),
    ).rejects.toThrow(/active agent run/i)
    expect(await ctx.readAll('reviewRequests')).toEqual([])

    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Prepare review' })
    await agent.mutation(api.agentRuns.completeRun, { agentRunId: run._id })
    await expect(
      requestAgentReview(agent, {
        runId: run._id,
        entryId,
        expectedVersion: 1,
        title: 'Closed run',
      }),
    ).rejects.toThrow(/not active/i)
    expect(await ctx.readAll('reviewRequests')).toEqual([])
  })

  it('binds one MCP operation key to one canonical review across retries and concurrency', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await createEditorAgent(ctx)
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Retry-safe review' })
    const operationKey = 'publish-review-operation-000000000001'
    const request = () =>
      requestAgentReviewWithOperationKey(agent, {
        operationKey,
        runId: run._id,
        entryId,
        expectedVersion: 1,
        title: 'Retry-safe publish review',
      })

    const [first, concurrent] = await Promise.all([request(), request()])
    const retry = await request()
    expect(first._id).toBe(concurrent._id)
    expect(retry._id).toBe(first._id)
    expect(await ctx.readAll('reviewRequests')).toEqual([
      expect.objectContaining({
        _id: first._id,
        mcpOperationKey: operationKey,
        status: 'pending',
      }),
    ])

    await expect(
      requestAgentReviewWithOperationKey(agent, {
        operationKey,
        runId: run._id,
        entryId,
        expectedVersion: 1,
        title: 'Conflicting publish review',
      }),
    ).rejects.toThrow(/different review request/i)
    expect(await ctx.readAll('reviewRequests')).toHaveLength(1)

    await agent.mutation(api.editor.mcpSaveEntryDraft, {
      agentRunId: run._id,
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Changed after request' } } } },
    })
    await expect(request()).resolves.toMatchObject({ _id: first._id, isStale: true })
    expect(await ctx.readAll('reviewRequests')).toHaveLength(1)

    await seedMember(ctx, { userId: 'editor-2', role: 'editor' })
    await seedMcpDelegation(ctx, {
      oauthClientId: 'client-editor-2',
      ownerUserId: 'editor-2',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const otherAgent = ctx.asMcpOAuth('client-editor-2', 'editor-2')
    await expect(
      otherAgent.query(api.reviewRequests.getOwnReviewRequest, {
        reviewRequestId: first._id,
      }),
    ).rejects.toThrow(/different caller|different user|does not belong/i)

    const editorMember = (await ctx.readAll('members')).find((row) => row.userId === 'editor-1')
    if (!editorMember) throw new Error('Editor member fixture is missing.')
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(editorMember._id, { role: 'viewer' })
    })
    await expect(request()).rejects.toThrow(/Edit entries/i)
  })

  it('[AGT-06][COL-03][PUB-03] pins the canonical draft and preview when requesting review, blocks stale approval, and preserves recoverable work', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await createEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Prepare review' })

    const review = await requestAgentReview(agent, {
      runId: run._id,
      entryId,
      expectedVersion: 1,
      title: 'Pinned review',
    })
    expect(await ctx.readAll('reviewRequests')).toEqual([
      expect.objectContaining({
        _id: review._id,
        agentRunId: run._id,
        entryId,
        expectedVersion: 1,
        versionHash: review.versionHash,
        previewHash: expect.stringMatching(/^preview:/),
        preview: expect.objectContaining({
          kind: 'publish-review-preview',
          status: 'ready',
        }),
      }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])

    await agent.mutation(api.editor.mcpSaveEntryDraft, {
      agentRunId: run._id,
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Changed after review' } } } },
    })
    const beforeApproval = {
      entries: structuredClone(await ctx.readAll('entries')),
      reviews: structuredClone(await ctx.readAll('reviewRequests')),
      revisions: structuredClone(await ctx.readAll('entryRevisions')),
      publicEntries: structuredClone(await ctx.readAll('publicEntries')),
      activity: structuredClone(await ctx.readAll('activity')),
      outbox: structuredClone(await ctx.readAll('outboxEvents')),
      receipts: structuredClone(await ctx.readAll('destructiveAuditLog')),
    }
    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow(/out of date|stale/i)
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('reviewRequests')).toEqual([
      expect.objectContaining({ _id: review._id, status: 'pending', expectedVersion: 1 }),
    ])
    expect(await ctx.readAll('entries')).toEqual(beforeApproval.entries)
    expect(await ctx.readAll('reviewRequests')).toEqual(beforeApproval.reviews)
    expect(await ctx.readAll('entryRevisions')).toEqual(beforeApproval.revisions)
    expect(await ctx.readAll('publicEntries')).toEqual(beforeApproval.publicEntries)
    expect(await ctx.readAll('activity')).toEqual(beforeApproval.activity)
    expect(await ctx.readAll('outboxEvents')).toEqual(beforeApproval.outbox)
    expect(await ctx.readAll('destructiveAuditLog')).toEqual(beforeApproval.receipts)
  })

  it('[PUB-05][PUB-10] allows only publishers to approve through canonical publication with an active revision and separately pending revalidation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const agent = await createEditorAgent(ctx)
    const publisher = ctx.asCmsUser('publisher-1')
    const viewer = ctx.asCmsUser('viewer-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Prepare review' })
    const review = await requestAgentReview(agent, {
      runId: run._id,
      entryId,
      expectedVersion: 1,
      title: 'Approve canonical publish',
    })

    await expect(
      agent.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow(/Publish entries/i)
    await expect(
      viewer.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).rejects.toThrow(/Publish entries/i)
    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: 'stale-hash',
      }),
    ).rejects.toThrow(/out of date/i)

    await expect(
      publisher.mutation(api.reviewRequests.approveReview, {
        reviewRequestId: review._id,
        expectedVersionHash: review.versionHash,
      }),
    ).resolves.toMatchObject({
      _id: review._id,
      status: 'approved',
      reviewedBy: 'publisher-1',
    })

    const revision = (await ctx.readAll('entryRevisions'))[0]!
    expect(revision).toMatchObject({ kind: 'publish', affectedLocales: ['en'] })
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({ entryId, locale: 'en', revisionId: revision._id }),
    ])
    expect((await ctx.readAll('entries'))[0]!.activePublications).toEqual([
      expect.objectContaining({ locale: 'en', revisionId: revision._id }),
    ])
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reviewRequest.approved',
          appIdentityId: 'publisher-1',
          detail: expect.objectContaining({
            reviewRequestId: review._id,
            previewHash: expect.stringMatching(/^preview:/),
            result: expect.objectContaining({ affectedLocales: ['en'] }),
          }),
        }),
      ]),
    )
    expect(await ctx.readAll('destructiveAuditLog')).toEqual([
      expect.objectContaining({
        operationId: 'ginko-cms.publish-entry',
        executePath: 'entries/publish:publishEntryOperationExecute',
        jti: `review:${review._id}`,
        callerKey: 'user:publisher-1',
        scopeKey: 'ginko-cms',
        status: 'applied',
        code: null,
        message: null,
      }),
    ])
    expect(await ctx.readAll('outboxEvents')).toEqual([
      expect.objectContaining({
        type: 'content.revalidate',
        status: 'pending',
        payload: expect.objectContaining({
          reason: 'publish',
          entryId,
          appIdentityId: 'publisher-1',
          revisionId: revision._id,
        }),
      }),
    ])
  })

  it('[PUB-06] rejects a review with durable feedback while draft and public output remain unchanged', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const editor = ctx.asCmsUser('editor-1')
    const publisher = ctx.asCmsUser('publisher-1')
    const review = await editor.mutation(api.reviewRequests.requestPublishReview, {
      entryId,
      expectedVersion: 1,
      locales: ['en'],
      title: 'Needs editorial decision',
      summary: 'Please review the page.',
    })
    const contentBefore = {
      entries: structuredClone(await ctx.readAll('entries')),
      drafts: structuredClone(await ctx.readAll('entryLocaleDrafts')),
      revisions: structuredClone(await ctx.readAll('entryRevisions')),
      publicEntries: structuredClone(await ctx.readAll('publicEntries')),
    }

    await expect(
      ctx.asCmsUser('viewer-1').mutation(api.reviewRequests.rejectReview, {
        reviewRequestId: review._id,
        feedback: 'Forged decision',
      }),
    ).rejects.toThrow(/Publish entries/i)
    await expect(
      publisher.mutation(api.reviewRequests.rejectReview, {
        reviewRequestId: review._id,
        feedback: '  Add the campaign date before resubmitting.  ',
      }),
    ).resolves.toMatchObject({
      _id: review._id,
      status: 'rejected',
      reviewedBy: 'publisher-1',
      reviewFeedback: 'Add the campaign date before resubmitting.',
    })

    expect(await ctx.readAll('entries')).toEqual(contentBefore.entries)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(contentBefore.drafts)
    expect(await ctx.readAll('entryRevisions')).toEqual(contentBefore.revisions)
    expect(await ctx.readAll('publicEntries')).toEqual(contentBefore.publicEntries)
    await expect(
      editor.query(api.reviewRequests.listRecentReviewOutcomesForEntry, {
        entryId,
        limit: 5,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        _id: review._id,
        status: 'rejected',
        reviewedBy: 'publisher-1',
        reviewFeedback: 'Add the campaign date before resubmitting.',
      }),
    ])
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reviewRequest.rejected',
          appIdentityId: 'publisher-1',
        }),
      ]),
    )
  })

  it('writes the same applied operation receipt contract for Studio and review approval', async () => {
    async function runPublish(mode: 'studio' | 'review') {
      const ctx = createCtx()
      await seedOwner(ctx)
      await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
      await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
      await seedSettings(ctx)
      const { entryId } = await seedEditorFixture(ctx)
      const agent = await createEditorAgent(ctx)
      const publisher = ctx.asCmsUser('publisher-1')
      const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Receipt parity' })
      const review = await requestAgentReview(agent, {
        runId: run._id,
        entryId,
        expectedVersion: 1,
        title: 'Receipt parity',
      })

      let confirmedPreviewHash: string
      if (mode === 'studio') {
        await publishEntry(publisher, entryId)
        confirmedPreviewHash = (await ctx.readAll('destructiveConfirmations'))[0]!.previewHash
      } else {
        await publisher.mutation(api.entries.publish.previewPublishEntryOperation, {
          entryId,
          locales: ['en'],
          expectedVersion: 1,
        })
        confirmedPreviewHash = (await ctx.readAll('destructiveConfirmations'))[0]!.previewHash
        await publisher.mutation(api.reviewRequests.approveReview, {
          reviewRequestId: review._id,
          expectedVersionHash: review.versionHash,
        })
      }
      return { ctx, entryId, review, confirmedPreviewHash }
    }

    const studio = await runPublish('studio')
    const approved = await runPublish('review')
    const studioReceipt = (await studio.ctx.readAll('destructiveAuditLog'))[0]!
    const reviewReceipt = (await approved.ctx.readAll('destructiveAuditLog'))[0]!
    const comparableReceipt = (receipt: Record<string, unknown>) => ({
      operationId: receipt.operationId,
      executePath: receipt.executePath,
      callerKey: receipt.callerKey,
      scopeKey: receipt.scopeKey,
      argsHash: receipt.argsHash,
      status: receipt.status,
      code: receipt.code,
      message: receipt.message,
    })

    expect(comparableReceipt(reviewReceipt)).toEqual(comparableReceipt(studioReceipt))
    expect(studioReceipt.previewHash).toBe(studio.confirmedPreviewHash)
    expect(reviewReceipt.previewHash).toBe(approved.confirmedPreviewHash)
    expect(studioReceipt.jti).not.toMatch(/^review:/)
    expect(reviewReceipt.jti).toBe(`review:${approved.review._id}`)

    for (const result of [studio, approved]) {
      const revision = (await result.ctx.readAll('entryRevisions'))[0]!
      expect(await result.ctx.readAll('publicEntries')).toEqual([
        expect.objectContaining({
          entryId: result.entryId,
          locale: 'en',
          revisionId: revision._id,
        }),
      ])
      expect(await result.ctx.readAll('activity')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'entry.published',
            appIdentityId: 'publisher-1',
            entryId: result.entryId,
          }),
        ]),
      )
      expect(await result.ctx.readAll('outboxEvents')).toEqual([
        expect.objectContaining({
          type: 'content.revalidate',
          payload: expect.objectContaining({
            reason: 'publish',
            appIdentityId: 'publisher-1',
          }),
        }),
      ])
    }
  })
})
