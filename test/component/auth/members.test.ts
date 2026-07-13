import {
  bootstrapCmsOwner,
  bootstrapCmsOwnerComponent,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { describe, expect, it } from 'vitest'

import type { CmsAppIdentity, CmsMemberAppIdentity } from '#component/auth/appIdentity.js'
import {
  canArchiveEntries,
  canCreateEntries,
  canDeleteEntries,
  canEditEntries,
  canManageAssets,
  canManageBackups,
  canManageCollections,
  canManageMembers,
  canManagePortability,
  canManageSettings,
  canPublishEntries,
  canRead,
  can,
  isBootstrapUser,
  hasRole,
  cmsPermissionGuards,
} from '#component/auth/checks.js'
import { bootstrapCmsOwnerRecord, validateFirstOwnerEmail } from '#component/members.js'

function createMembersCtx(initialMembers: Array<Record<string, unknown>> = []) {
  let memberCounter = 0
  let activityCounter = 0
  const state = {
    members: initialMembers.map((member) => ({
      _id: String(member._id ?? `member_${++memberCounter}`),
      updatedAt: member.updatedAt ?? null,
      updatedBy: member.updatedBy ?? null,
      ...member,
    })) as Array<Record<string, unknown>>,
    activity: [] as Array<Record<string, unknown>>,
  }

  const db = {
    query(table: string) {
      if (table === 'members') {
        return {
          withIndex(
            _index: string,
            callback: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
          ) {
            const filter = { field: '', value: undefined as unknown }
            callback({
              eq(field: string, value: unknown) {
                filter.field = field
                filter.value = value
                return this
              },
            })
            return {
              first: async () =>
                state.members.find((member) => member[filter.field] === filter.value) ?? null,
            }
          },
          first: async () => state.members[0] ?? null,
          collect: async () => [...state.members],
        }
      }

      if (table === 'activity') {
        return {
          first: async () => state.activity[0] ?? null,
          collect: async () => [...state.activity],
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
    async insert(table: string, value: Record<string, unknown>) {
      if (table === 'members') {
        const doc = { _id: `member_${++memberCounter}`, ...value }
        state.members.push(doc)
        return doc._id
      }

      if (table === 'activity') {
        const doc = { _id: `activity_${++activityCounter}`, ...value }
        state.activity.push(doc)
        return doc._id
      }

      throw new Error(`Unexpected table ${table}`)
    },
    async get(id: string) {
      return (
        state.members.find((member) => member._id === id) ??
        state.activity.find((entry) => entry._id === id) ??
        null
      )
    },
  }

  return { ctx: { db } as Parameters<typeof bootstrapCmsOwnerRecord>[0], state }
}

function memberAppIdentity(role: 'owner' | 'publisher' | 'editor' | 'viewer'): CmsAppIdentity {
  return {
    kind: 'member',
    userId: `${role}_1`,
    role,
    member: {
      _id: `member_${role}`,
      _creationTime: 0,
      userId: `${role}_1`,
      role,
      createdAt: 0,
      updatedAt: 0,
      updatedBy: `${role}_1`,
    } as CmsMemberAppIdentity['member'],
    canBootstrap: false,
    caller: cmsUserCaller(`${role}_1`),
    audit: { origin: 'user' },
  }
}

describe('cms member bootstrap', () => {
  it('keeps caller-controlled email out of both bootstrap boundaries', () => {
    expect(Object.keys(bootstrapCmsOwner.args)).toEqual(['displayName'])
    expect(Object.keys(bootstrapCmsOwnerComponent.args).sort()).toEqual([
      'configuredOwnerEmail',
      'displayName',
    ])
  })

  it('creates exactly one bootstrap owner and logs the activity', async () => {
    const { ctx, state } = createMembersCtx()

    const member = await bootstrapCmsOwnerRecord(ctx, 'user_1')

    expect(member).toMatchObject({
      userId: 'user_1',
      role: 'owner',
    })
    expect(state.members).toHaveLength(1)
    expect(state.activity).toHaveLength(1)
    expect(state.activity[0]).toMatchObject({
      kind: 'member.added',
      appIdentityId: 'user_1',
      detail: { userId: 'user_1', role: 'owner', bootstrap: true },
    })
  })

  it('persists forwarded bootstrap profile fields', async () => {
    const { ctx } = createMembersCtx()

    const member = await bootstrapCmsOwnerRecord(ctx, 'user_1', {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    })

    expect(member).toMatchObject({
      userId: 'user_1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('rejects a second bootstrap attempt once membership exists', async () => {
    const { ctx } = createMembersCtx()

    await bootstrapCmsOwnerRecord(ctx, 'user_1')
    await expect(bootstrapCmsOwnerRecord(ctx, 'user_2')).rejects.toThrow(
      'CMS bootstrap has already been completed',
    )
  })
})

describe('first owner email validation', () => {
  it('succeeds with matching configured email', () => {
    expect(() => validateFirstOwnerEmail('Owner@Example.com', 'owner@example.com')).not.toThrow()
  })

  it('fails closed when owner email is not configured', () => {
    expect(() => validateFirstOwnerEmail('owner@example.com', undefined)).toThrow(
      'CMS initial owner email is not configured',
    )
  })

  it('fails when the signed-in account has no email', () => {
    expect(() => validateFirstOwnerEmail(undefined, 'owner@example.com')).toThrow(
      'must have an email address',
    )
  })

  it('fails when the email does not match the configured owner', () => {
    expect(() => validateFirstOwnerEmail('other@example.com', 'owner@example.com')).toThrow(
      'This account is not authorized to claim CMS ownership.',
    )
  })
})

describe('cms guards', () => {
  it('fails closed for MCP identities when a protected guard has no permission', () => {
    const owner = memberAppIdentity('owner') as CmsMemberAppIdentity
    const mcpOwner: CmsMemberAppIdentity = {
      ...owner,
      caller: { kind: 'mcp', apiKeyId: 'key_1' },
      mcpEffectivePermissions: {},
      audit: { origin: 'mcp', apiKeyId: 'key_1' },
    }

    expect(can(mcpOwner, hasRole('owner'))).toBe(false)
  })

  it('allows bootstrap appIdentitys to read and bootstrap, but nothing stronger', () => {
    const appIdentity: CmsAppIdentity = {
      kind: 'authenticated',
      userId: 'user_bootstrap',
      role: null,
      member: null,
      canBootstrap: true,
      caller: cmsUserCaller('user_bootstrap'),
      audit: { origin: 'user' },
    }

    expect(can(appIdentity, isBootstrapUser)).toBe(true)
    expect(can(appIdentity, canRead)).toBe(true)
    expect(can(appIdentity, canCreateEntries)).toBe(false)
    expect(can(appIdentity, canEditEntries)).toBe(false)
    expect(can(appIdentity, canPublishEntries)).toBe(false)
    expect(can(appIdentity, canArchiveEntries)).toBe(false)
    expect(can(appIdentity, canDeleteEntries)).toBe(false)
    expect(can(appIdentity, canManageCollections)).toBe(false)
    expect(can(appIdentity, canManageSettings)).toBe(false)
    expect(can(appIdentity, canManageMembers)).toBe(false)
    expect(can(appIdentity, canManageAssets)).toBe(false)
    expect(can(appIdentity, canManageBackups)).toBe(false)
    expect(can(appIdentity, canManagePortability)).toBe(false)
  })

  it('maps owner, publisher, editor, and viewer roles to the expected permission matrix', () => {
    const owner = memberAppIdentity('owner')
    const publisher = memberAppIdentity('publisher')
    const editor = memberAppIdentity('editor')
    const viewer = memberAppIdentity('viewer')

    expect(can(owner, canRead)).toBe(true)
    expect(can(owner, canCreateEntries)).toBe(true)
    expect(can(owner, canEditEntries)).toBe(true)
    expect(can(owner, canPublishEntries)).toBe(true)
    expect(can(owner, canArchiveEntries)).toBe(true)
    expect(can(owner, canDeleteEntries)).toBe(true)
    expect(can(owner, canManageCollections)).toBe(true)
    expect(can(owner, canManageSettings)).toBe(true)
    expect(can(owner, canManageMembers)).toBe(true)
    expect(can(owner, canManageAssets)).toBe(true)
    expect(can(owner, canManageBackups)).toBe(true)
    expect(can(owner, canManagePortability)).toBe(true)

    expect(can(publisher, canRead)).toBe(true)
    expect(can(publisher, canCreateEntries)).toBe(true)
    expect(can(publisher, canEditEntries)).toBe(true)
    expect(can(publisher, canPublishEntries)).toBe(true)
    expect(can(publisher, canArchiveEntries)).toBe(false)
    expect(can(publisher, canDeleteEntries)).toBe(false)
    expect(can(publisher, canManageCollections)).toBe(false)
    expect(can(publisher, canManageSettings)).toBe(false)
    expect(can(publisher, canManageMembers)).toBe(false)
    expect(can(publisher, canManageAssets)).toBe(true)
    expect(can(publisher, canManageBackups)).toBe(false)
    expect(can(publisher, canManagePortability)).toBe(false)

    expect(can(editor, canRead)).toBe(true)
    expect(can(editor, canCreateEntries)).toBe(true)
    expect(can(editor, canEditEntries)).toBe(true)
    expect(can(editor, canPublishEntries)).toBe(false)
    expect(can(editor, canArchiveEntries)).toBe(false)
    expect(can(editor, canDeleteEntries)).toBe(false)
    expect(can(editor, canManageCollections)).toBe(false)
    expect(can(editor, canManageSettings)).toBe(false)
    expect(can(editor, canManageMembers)).toBe(false)
    expect(can(editor, canManageAssets)).toBe(true)

    expect(can(viewer, canRead)).toBe(true)
    expect(can(viewer, canCreateEntries)).toBe(false)
    expect(can(viewer, canEditEntries)).toBe(false)
    expect(can(viewer, canPublishEntries)).toBe(false)
    expect(can(viewer, canArchiveEntries)).toBe(false)
    expect(can(viewer, canDeleteEntries)).toBe(false)
    expect(can(viewer, canManageCollections)).toBe(false)
    expect(can(viewer, canManageSettings)).toBe(false)
    expect(can(viewer, canManageMembers)).toBe(false)
    expect(can(viewer, canManageAssets)).toBe(false)
  })

  it.each(['owner', 'publisher', 'editor', 'viewer'] as const)(
    'intersects every %s MCP permission with both role and explicit scope',
    (role) => {
      const user = memberAppIdentity(role) as CmsMemberAppIdentity
      const allScopes = Object.fromEntries(cmsPermissionGuards.map(({ key }) => [key, true]))
      const noScopes = Object.fromEntries(cmsPermissionGuards.map(({ key }) => [key, false]))
      const mcp = (scopes: Record<string, boolean>): CmsMemberAppIdentity => ({
        ...user,
        caller: { kind: 'mcp', apiKeyId: `${role}_key` },
        mcpEffectivePermissions: scopes,
        audit: { origin: 'mcp', apiKeyId: `${role}_key` },
      })

      for (const { guard } of cmsPermissionGuards) {
        expect(can(mcp(allScopes), guard)).toBe(can(user, guard))
        expect(can(mcp(noScopes), guard)).toBe(false)
      }
    },
  )
})
