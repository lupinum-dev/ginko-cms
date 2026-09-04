import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { cmsRoleValidator } from '../validators.js'

export const getMember = defineArgs({
  description: 'Load one CMS member by user id.',
  args: {
    userId: v.string(),
  },
})

export const sendMemberInvitation = defineArgs({
  description: 'Invite a person to become a CMS member through the host delivery boundary.',
  args: {
    email: v.string(),
    role: cmsRoleValidator,
    expiresInHours: v.number(),
  },
  meta: {
    email: {
      label: 'Email',
      description: 'Email address that the verified Better Auth identity must match.',
    },
    role: {
      label: 'Initial role',
      description: 'CMS role activated exactly as reviewed after acceptance.',
      enum: ['owner', 'publisher', 'editor', 'viewer'],
    },
    expiresInHours: {
      label: 'Expires in',
      description: 'Invitation lifetime in hours, from 1 hour through 30 days.',
    },
  },
})

export const prepareMemberInvitationDelivery = defineArgs({
  description: 'Prepare a hashed one-time member invitation for host-owned delivery.',
  args: {
    email: v.string(),
    role: cmsRoleValidator,
    expiresInHours: v.number(),
    tokenHash: v.string(),
  },
})

export const resendMemberInvitation = defineArgs({
  description: 'Rotate and resend a pending member invitation.',
  args: {
    invitationId: v.string(),
    expiresInHours: v.number(),
  },
})

export const prepareMemberInvitationResend = defineArgs({
  description: 'Rotate a pending invitation token before host-owned delivery.',
  args: {
    invitationId: v.string(),
    expiresInHours: v.number(),
    tokenHash: v.string(),
  },
})

export const recordMemberInvitationDelivery = defineArgs({
  description: 'Fence and record the host delivery outcome for an invitation generation.',
  args: {
    invitationId: v.string(),
    generation: v.number(),
    delivered: v.boolean(),
  },
})

export const revokeMemberInvitation = defineArgs({
  description: 'Revoke and remove a pending member invitation.',
  args: {
    invitationId: v.string(),
  },
})

export const acceptMemberInvitation = defineArgs({
  description: 'Accept an invitation using a browser-derived one-time token proof.',
  args: {
    tokenProof: v.string(),
  },
})

export const bootstrapCmsOwner = defineArgs({
  description: 'Bootstrap the first CMS owner.',
  args: {
    displayName: v.optional(v.string()),
  },
  meta: {
    displayName: {
      label: 'Display Name',
      description: 'Preferred name to persist on the bootstrapped owner record.',
    },
  },
})

export const bootstrapCmsOwnerComponent = defineArgs({
  description: 'Bootstrap the first CMS owner from the host app.',
  args: {
    displayName: v.optional(v.string()),
    configuredOwnerEmail: v.optional(v.string()),
  },
  meta: {
    displayName: {
      label: 'Display Name',
      description: 'Preferred name to persist on the bootstrapped owner record.',
    },
    configuredOwnerEmail: {
      label: 'Configured Owner Email',
      description: 'Host deployment first-owner email used to authorize bootstrapping.',
    },
  },
})

export const updateMemberRole = defineArgs({
  description: 'Change a CMS member role.',
  args: {
    userId: v.string(),
    role: cmsRoleValidator,
  },
})

export const removeMember = defineArgs({
  description: 'Remove a CMS member.',
  args: {
    userId: v.string(),
  },
})
