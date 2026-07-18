import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx } from '../../helpers'

const api = anyApi

function bootstrapCaller(
  ctx: ReturnType<typeof createCtx>,
  input: { subject: string; email?: string },
) {
  return ctx.raw.withIdentity({
    subject: input.subject,
    email: input.email,
    sessionId: `session_${input.subject}`,
    ginkoCredentialKind: 'user-session',
  })
}

describe('first-owner callable boundary', () => {
  it('fails closed for missing configured or verified email', async () => {
    const ctx = createCtx()

    await expect(
      bootstrapCaller(ctx, { subject: 'user_1', email: 'owner@example.com' }).mutation(
        api.members.bootstrapCmsOwner,
        { displayName: 'Owner' },
      ),
    ).rejects.toThrow('CMS initial owner email is not configured')

    await expect(
      bootstrapCaller(ctx, { subject: 'user_1' }).mutation(api.members.bootstrapCmsOwner, {
        displayName: 'Owner',
        configuredOwnerEmail: 'owner@example.com',
      }),
    ).rejects.toThrow('must have an email address')
  })

  it('[ACC-02] normalizes the verified email and permits exactly one owner claim', async () => {
    const ctx = createCtx()
    const caller = bootstrapCaller(ctx, { subject: 'user_1', email: 'Owner@Example.com' })

    await expect(
      caller.mutation(api.members.bootstrapCmsOwner, {
        displayName: 'Owner',
        configuredOwnerEmail: ' owner@example.com ',
      }),
    ).resolves.toMatchObject({ userId: 'user_1', email: 'owner@example.com', role: 'owner' })

    await expect(
      bootstrapCaller(ctx, { subject: 'user_2', email: 'owner@example.com' }).mutation(
        api.members.bootstrapCmsOwner,
        { configuredOwnerEmail: 'owner@example.com' },
      ),
    ).rejects.toThrow('CMS bootstrap has already been completed')
  })

  it('serializes concurrent owner claims so only one commits', async () => {
    const ctx = createCtx()
    const claims = await Promise.allSettled(
      ['user_1', 'user_2'].map((subject) =>
        bootstrapCaller(ctx, { subject, email: 'owner@example.com' }).mutation(
          api.members.bootstrapCmsOwner,
          { configuredOwnerEmail: 'owner@example.com' },
        ),
      ),
    )

    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1)
    expect(claims.filter((claim) => claim.status === 'rejected')).toHaveLength(1)
    expect(await ctx.readAll('members')).toHaveLength(1)
  })
})
