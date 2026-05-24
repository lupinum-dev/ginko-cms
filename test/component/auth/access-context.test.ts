/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMember } from '../../helpers'

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
})
