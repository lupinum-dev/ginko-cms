import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  MEMBER_INVITATION_SAFE_ERROR,
  memberInvitationTokenProof,
  readMemberInvitationToken,
} from '../../packages/cms/studio-app/src/lib/memberInvitation'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('[ADM-02] Studio invitation onboarding', () => {
  it('[ADM-02] derives the browser proof without exposing identity or role inputs', async () => {
    const rawToken = `browser-proof-${'z'.repeat(64)}`
    const expected = createHash('sha256').update(rawToken).digest('hex')
    await expect(memberInvitationTokenProof(rawToken)).resolves.toBe(expected)
    await expect(memberInvitationTokenProof('short')).resolves.toBeNull()
    expect(readMemberInvitationToken(`#token=${encodeURIComponent(rawToken)}`)).toBe(rawToken)

    const page = read('packages/cms/studio-app/src/pages/invitations/accept.vue')
    expect(page).toContain('acceptInvitation({ tokenProof: proof })')
    expect(page).not.toMatch(/acceptInvitation\(\{[^}]*\b(userId|email|role)\b/u)
    expect(page).toContain('catch {')
    expect(page).toContain("t('ginkoCms.studio.invitationPage.invalid')")
    expect(MEMBER_INVITATION_SAFE_ERROR).toBe(
      'This invitation cannot be accepted. Ask the CMS owner for a new invitation.',
    )
  })

  it('[ADM-02] provides an authenticated noindex acceptance route without opening other Studio routes', () => {
    const router = read('packages/cms/studio-app/src/router.ts')
    const layout = read('packages/cms/studio-app/src/Layout.vue')
    const host = read('packages/cms/src/runtime/pages/studio-host.vue')
    expect(router).toContain("path: '/invitations/accept'")
    expect(router).toContain('meta: { authenticatedPublic: true }')
    expect(layout).toContain("studioAccess.status === 'invitation'")
    expect(layout).toContain('isInvitationRoute.value && isAuthenticated.value')
    expect(layout).toContain("status: 'forbidden', reason: 'membership'")
    expect(host).toContain("route.path.endsWith('/invitations/accept')")
    expect(host).toContain("content: 'noindex, nofollow, noarchive'")
  })

  it('[ADM-02] shows owner-only pending controls and enumeration-safe viewer copy', () => {
    const settings = read(
      'packages/cms/studio-app/src/components/studio/settings/StudioSettingsMembersSection.vue',
    )
    expect(settings).toContain('settings.memberInvitations')
    expect(settings).toContain('settings.handleSendMemberInvitation')
    expect(settings).toContain('settings.handleResendMemberInvitation')
    expect(settings).toContain('settings.handleRevokeMemberInvitation')
    expect(settings).toContain('v-if="!settings.canManageMembers"')
    expect(settings).toContain('memberOwnerOnly')
    expect(settings).not.toContain('newMember.userId')
  })
})
