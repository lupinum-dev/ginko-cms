/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember, seedOwner } from '../helpers'
import { seedEditorFixture, seedSettings } from './entries/helpers'

const api = anyApi

async function createEditorAgent(ctx: ReturnType<typeof createCtx>) {
  await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
    apiKeyId: 'ba_key_editor',
    ownerUserId: 'editor-1',
    scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
  })
  return ctx.asMcpApiKey('ba_key_editor', 'editor-1')
}

async function requestAgentReview(
  agent: ReturnType<ReturnType<typeof createCtx>['asMcpApiKey']>,
  args: { runId: string; entryId: string; expectedVersion: number; title: string },
) {
  return await agent.mutation(api.reviewRequests.requestPublishReview, {
    agentRunId: args.runId,
    entryId: args.entryId,
    expectedVersion: args.expectedVersion,
    locales: ['en'],
    title: args.title,
    summary: 'Ready for a publisher decision.',
  })
}

describe('canonical publish reviews', () => {
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

  it('pins draft version, draft hash, and backend preview hash and becomes stale after edit', async () => {
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
  })

  it('allows only publishers to approve and publishes through the canonical operation', async () => {
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
  })
})
