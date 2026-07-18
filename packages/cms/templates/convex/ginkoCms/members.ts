import {
  acceptMemberInvitation as acceptMemberInvitationArgs,
  bootstrapCmsOwner as bootstrapCmsOwnerArgs,
  getMember as getMemberArgs,
  removeMember as removeMemberArgs,
  resendMemberInvitation as resendMemberInvitationArgs,
  revokeMemberInvitation as revokeMemberInvitationArgs,
  sendMemberInvitation as sendMemberInvitationArgs,
  updateMemberRole as updateMemberRoleArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { action, mutation, query } from '../_generated/server.js'

declare const process: {
  env: Record<string, string | undefined>
}

type MemberInvitation = {
  invitationId: string
  email: string
  role: 'owner' | 'publisher' | 'editor' | 'viewer'
  generation: number
  expiresAt: number
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function invitationDeliveryConfig() {
  const endpoint = process.env.GINKO_MEMBER_INVITATION_DELIVERY_URL?.trim()
  const secret = process.env.GINKO_MEMBER_INVITATION_DELIVERY_SECRET?.trim()
  const acceptUrl = process.env.GINKO_MEMBER_INVITATION_ACCEPT_URL?.trim()
  if (!endpoint || !secret || !acceptUrl) {
    throw new Error(
      'Member invitation delivery is not configured. Set GINKO_MEMBER_INVITATION_DELIVERY_URL, GINKO_MEMBER_INVITATION_DELIVERY_SECRET, and GINKO_MEMBER_INVITATION_ACCEPT_URL.',
    )
  }
  const endpointUrl = new URL(endpoint)
  const acceptanceUrl = new URL(acceptUrl)
  if (!isSecureInvitationUrl(endpointUrl) || !isSecureInvitationUrl(acceptanceUrl)) {
    throw new Error(
      'Member invitation delivery and acceptance URLs must use HTTPS (localhost HTTP is allowed for development).',
    )
  }
  return { endpointUrl, acceptanceUrl, secret }
}

function isSecureInvitationUrl(url: URL) {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'))
  )
}

function trustedCaller(identity: Awaited<ReturnType<typeof cmsCallerFromActionAuthIdentity>>) {
  return identity ?? undefined
}

async function invitationTokenMaterial() {
  const token = `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`
  const tokenProof = await sha256Hex(token)
  return { token, tokenHash: await sha256Hex(tokenProof) }
}

async function deliverInvitation(
  endpointUrl: URL,
  secret: string,
  acceptanceUrl: URL,
  token: string,
  invitation: MemberInvitation,
) {
  const link = new URL(acceptanceUrl)
  link.hash = new URLSearchParams({ token }).toString()
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      invitationId: invitation.invitationId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptUrl: link.toString(),
    }),
  })
  if (!response.ok) {
    throw new Error(`Member invitation delivery boundary returned HTTP ${response.status}.`)
  }
}

async function deliverPreparedInvitation(
  invitation: MemberInvitation,
  token: string,
  recordDelivery: (delivered: boolean) => Promise<unknown>,
) {
  const config = invitationDeliveryConfig()
  try {
    await deliverInvitation(
      config.endpointUrl,
      config.secret,
      config.acceptanceUrl,
      token,
      invitation,
    )
  } catch {
    await recordDelivery(false)
    throw new Error('Member invitation delivery failed. Retry from CMS Settings.')
  }
  return await recordDelivery(true)
}

export const getAccessContext = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.members.getAccessContext, args),
})

export const bootstrapCmsOwner = mutation({
  args: bootstrapCmsOwnerArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.bootstrapCmsOwner, {
      ...args,
      configuredOwnerEmail: process.env.GINKO_FIRST_OWNER_EMAIL,
    }),
})

export const listMembers = query({
  args: {},
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.members.listMembers, args),
})

export const getMember = query({
  args: getMemberArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.members.getMember, args),
})

export const listMemberInvitations = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.members.listMemberInvitations, args),
})

export const sendMemberInvitation = action({
  args: sendMemberInvitationArgs.args,
  handler: async (ctx, args) => {
    const caller = trustedCaller(cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()))
    const token = await invitationTokenMaterial()
    const invitation = (await ctx.runAction(
      components.ginkoCms.members.prepareMemberInvitationDelivery,
      {
        ...args,
        tokenHash: token.tokenHash,
        _trustedCaller: caller,
      },
    )) as MemberInvitation
    return await deliverPreparedInvitation(invitation, token.token, async (delivered) => {
      return await ctx.runAction(components.ginkoCms.members.recordMemberInvitationDelivery, {
        invitationId: invitation.invitationId,
        generation: invitation.generation,
        delivered,
        _trustedCaller: caller,
      })
    })
  },
})

export const resendMemberInvitation = action({
  args: resendMemberInvitationArgs.args,
  handler: async (ctx, args) => {
    const caller = trustedCaller(cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()))
    const token = await invitationTokenMaterial()
    const invitation = (await ctx.runAction(
      components.ginkoCms.members.prepareMemberInvitationResendDelivery,
      {
        ...args,
        tokenHash: token.tokenHash,
        _trustedCaller: caller,
      },
    )) as MemberInvitation
    return await deliverPreparedInvitation(invitation, token.token, async (delivered) => {
      return await ctx.runAction(components.ginkoCms.members.recordMemberInvitationDelivery, {
        invitationId: invitation.invitationId,
        generation: invitation.generation,
        delivered,
        _trustedCaller: caller,
      })
    })
  },
})

export const revokeMemberInvitation = mutation({
  args: revokeMemberInvitationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.revokeMemberInvitation, args),
})

export const acceptMemberInvitation = mutation({
  args: acceptMemberInvitationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.acceptMemberInvitation, args),
})

export const updateMemberRole = mutation({
  args: updateMemberRoleArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.updateMemberRole, args),
})

export const removeMember = mutation({
  args: confirmedArgs(removeMemberArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.removeMemberOperationExecute, args),
})

export const previewRemoveMemberOperation = mutation({
  args: removeMemberArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.previewRemoveMemberOperation, args),
})
