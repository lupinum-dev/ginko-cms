import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  acceptMemberInvitation,
  sendMemberInvitation,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import { describe, expect, it } from 'vitest'

import { studioApiSurface } from '../../packages/cms/src/public/studio-api-surface'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('[ADM-02] host-owned member invitation boundary', () => {
  it('[ADM-02] keeps identity and role out of the browser acceptance contract', () => {
    expect(Object.keys(sendMemberInvitation.args).sort()).toEqual([
      'email',
      'expiresInHours',
      'role',
    ])
    expect(Object.keys(acceptMemberInvitation.args)).toEqual(['tokenProof'])
    expect(studioApiSurface.members).toMatchObject({
      acceptMemberInvitation: 'mutation',
      listMemberInvitations: 'query',
      resendMemberInvitation: expect.objectContaining({ kind: 'action' }),
      revokeMemberInvitation: 'mutation',
      sendMemberInvitation: expect.objectContaining({ kind: 'action' }),
    })
    expect(studioApiSurface.members).not.toHaveProperty('addMember')
  })

  it('[ADM-02] generates raw entropy only in the host action and sends it only through the approved boundary', () => {
    const template = read('packages/cms/templates/convex/ginkoCms/members.ts')
    expect(template).toContain('globalThis.crypto.randomUUID()')
    expect(template).toContain('const tokenProof = await sha256Hex(token)')
    expect(template).toContain('tokenHash: await sha256Hex(tokenProof)')
    expect(template).toContain('GINKO_MEMBER_INVITATION_DELIVERY_URL')
    expect(template).toContain('GINKO_MEMBER_INVITATION_DELIVERY_SECRET')
    expect(template).toContain('link.hash = new URLSearchParams({ token }).toString()')
    expect(template).toContain('authorization: `Bearer ${secret}`')
    expect(template).toContain('tokenHash: token.tokenHash')
    expect(template).toContain(
      'return await deliverPreparedInvitation(invitation, token.token, async (delivered) =>',
    )
    expect(template).not.toContain('return token.token')
    expect(template).not.toContain('console.')
  })

  it('[ADM-02] persists only the double hash and keeps tracked host templates synchronized', () => {
    const schema = read('packages/convex/src/schema.ts')
    const invitationTable = schema.slice(
      schema.indexOf('memberInvitations: defineTable'),
      schema.indexOf('mcpOAuthDelegations: defineTable'),
    )
    expect(invitationTable).toContain('tokenHash: v.string()')
    expect(invitationTable).not.toMatch(/\btoken:\s*v\./u)

    const template = read('packages/cms/templates/convex/ginkoCms/members.ts')
    expect(read('playground/convex/ginkoCms/members.ts')).toBe(template)
    expect(read('test/fixtures/basic/convex/ginkoCms/members.ts')).toBe(template)
  })
})
