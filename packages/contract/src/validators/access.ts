import { v } from 'convex/values'

import { cmsRoleValidator } from './foundation.js'
import { localeConfigValidator } from './model.js'

export const memberValidator = v.object({
  _id: v.string(),
  userId: v.string(),
  displayName: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: cmsRoleValidator,
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  updatedBy: v.union(v.string(), v.null()),
})

export const memberInvitationValidator = v.object({
  invitationId: v.string(),
  email: v.string(),
  role: cmsRoleValidator,
  status: v.union(v.literal('pending'), v.literal('expired'), v.literal('delivery_failed')),
  deliveryState: v.union(v.literal('prepared'), v.literal('delivered'), v.literal('failed')),
  generation: v.number(),
  expiresAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deliveredAt: v.union(v.number(), v.null()),
})

export const permissionMapValidator = v.record(v.string(), v.boolean())

export const accessContextValidator = v.union(
  v.object({
    userId: v.union(v.string(), v.null()),
    role: v.union(cmsRoleValidator, v.null()),
    can: permissionMapValidator,
    member: v.union(memberValidator, v.null()),
    canBootstrap: v.boolean(),
  }),
  v.null(),
)

export const studioSettingsValidator = v.union(
  v.object({
    locales: v.array(localeConfigValidator),
    updatedAt: v.number(),
    updatedBy: v.union(v.string(), v.null()),
    installedContentHash: v.string(),
    installedPresentationHash: v.string(),
    transitionState: v.union(v.literal('ready'), v.literal('locked')),
    transitionRunId: v.union(v.string(), v.null()),
  }),
  v.null(),
)
