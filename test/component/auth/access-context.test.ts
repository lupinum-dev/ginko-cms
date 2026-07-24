/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMcpDelegation, seedMember } from '../../helpers'

describe('cms permission context', () => {
  it('returns null for unauthenticated callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.members.getAccessContext, {} as never)).resolves.toBeNull()
  })

  it('returns bootstrap permissions for the first authenticated non-member', async () => {
    const ctx = createCtx()
    const onboardingUser = ctx.asCmsUser('bootstrap-user')

    const accessCtx = await onboardingUser.query(api.members.getAccessContext, {})

    expect(accessCtx).toMatchObject({
      userId: 'bootstrap-user',
      role: null,
      canBootstrap: true,
      member: null,
    })
    expect(accessCtx?.can[cmsPermissionKeys.read]).toBe(true)
    expect(accessCtx?.can[cmsPermissionKeys.bootstrap]).toBe(true)
    expect(accessCtx?.can[cmsPermissionKeys.manageSettings]).toBe(false)
    expect(accessCtx?.can[cmsPermissionKeys.manageMembers]).toBe(false)
    expect(Object.keys(accessCtx?.can ?? {}).sort()).toEqual(
      Object.values(cmsPermissionKeys).sort(),
    )
    expect(accessCtx).not.toHaveProperty('permissions')
  })

  it('returns a non-null all-false permission map for authenticated non-members after bootstrap', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const outsider = ctx.asCmsUser('outsider-1')

    const accessCtx = await outsider.query(api.members.getAccessContext, {})

    expect(accessCtx).toMatchObject({
      userId: 'outsider-1',
      role: null,
      canBootstrap: false,
      member: null,
    })
    expect(accessCtx?.can[cmsPermissionKeys.bootstrap]).toBe(false)
    expect(accessCtx?.can[cmsPermissionKeys.read]).toBe(false)
    expect(Object.values(accessCtx?.can ?? {})).toEqual(
      Object.values(accessCtx?.can ?? {}).map(() => false),
    )
  })

  it('exposes bootstrap permissions before any member exists', async () => {
    const ctx = createCtx()
    const onboardingUser = ctx.asCmsUser('bootstrap-user')

    const accessCtx = await onboardingUser.query(api.members.getAccessContext, {})

    expect(accessCtx).toMatchObject({
      userId: 'bootstrap-user',
      role: null,
      canBootstrap: true,
      member: null,
    })
    expect(accessCtx?.can[cmsPermissionKeys.bootstrap]).toBe(true)
    expect(accessCtx?.can[cmsPermissionKeys.read]).toBe(true)
  })

  it('[ADM-01] applies an active member downgrade to the next Studio and MCP authority check', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMcpDelegation(ctx, {
      oauthClientId: 'client-editor',
      ownerUserId: 'editor-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    const owner = ctx.asCmsUser('owner-1')
    const editorAgent = ctx.asMcpOAuth('client-editor', 'editor-1')

    await expect(editorAgent.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'editor-1',
      role: 'editor',
      can: {
        [cmsPermissionKeys.editEntries]: true,
        [cmsPermissionKeys.publishEntries]: false,
      },
    })

    await owner.mutation(api.members.updateMemberRole, {
      userId: 'editor-1',
      role: 'viewer',
    })

    await expect(editorAgent.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'editor-1',
      role: 'viewer',
      can: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: false,
        [cmsPermissionKeys.publishEntries]: false,
      },
    })
  })

  it('binds MCP delegation lookup to the verified OAuth subject and client', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMcpDelegation(ctx, {
      oauthClientId: 'client-editor',
      ownerUserId: 'editor-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    const spoofedAgent = ctx.asMcpOAuth('client-editor', 'outsider-1')

    await expect(spoofedAgent.query(api.members.getAccessContext, {})).resolves.toBeNull()
  })

  it('reports only effective permissions shared by OAuth token and delegation scopes', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMcpDelegation(ctx, {
      oauthClientId: 'client-owner-edit-only',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    const ownerAgent = ctx.asMcpOAuth('client-owner-edit-only', 'owner-1')

    await expect(ownerAgent.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'owner-1',
      role: 'owner',
      can: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: true,
        [cmsPermissionKeys.manageMembers]: false,
        [cmsPermissionKeys.manageSettings]: false,
      },
    })
  })
})
