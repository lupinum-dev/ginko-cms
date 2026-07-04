import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { cmsRoleValidator } from '../validators.js'

export const getMember = defineArgs({
  description: 'Load one CMS member by user id.',
  args: {
    userId: v.string(),
  },
})

export const addMember = defineArgs({
  description: 'Add a CMS member.',
  args: {
    userId: v.string(),
    role: cmsRoleValidator,
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  meta: {
    userId: {
      label: 'User ID',
      description: 'Auth subject of the user to add.',
      examples: ['user_abc123'],
    },
    role: {
      label: 'Role',
      description: 'CMS role to grant to the user.',
      enum: ['owner', 'publisher', 'editor', 'viewer'],
    },
    displayName: {
      label: 'Display Name',
      description: 'Human-readable name of the user.',
    },
    email: {
      label: 'Email',
      description: 'Email address of the user.',
    },
  },
})

export const bootstrapCmsOwner = defineArgs({
  description: 'Bootstrap the first CMS owner.',
  args: {
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  meta: {
    displayName: {
      label: 'Display Name',
      description: 'Preferred name to persist on the bootstrapped owner record.',
    },
    email: {
      label: 'Email',
      description: 'Email address to persist on the bootstrapped owner record.',
    },
  },
})

export const bootstrapCmsOwnerComponent = defineArgs({
  description: 'Bootstrap the first CMS owner from the host app.',
  args: {
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    configuredOwnerEmail: v.optional(v.string()),
  },
  meta: {
    displayName: {
      label: 'Display Name',
      description: 'Preferred name to persist on the bootstrapped owner record.',
    },
    email: {
      label: 'Email',
      description: 'Email address to persist on the bootstrapped owner record.',
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
