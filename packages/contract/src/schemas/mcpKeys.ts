import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const createMcpKey = defineArgs({
  description: 'Create a bearer token for MCP clients.',
  args: {
    name: v.string(),
    boundUserId: v.string(),
    prefix: v.string(),
    hash: v.string(),
  },
  meta: {
    name: {
      label: 'Key name',
      description: 'Human-readable label for the MCP key.',
      examples: ['Claude Code - local dev'],
    },
    boundUserId: {
      label: 'Bound user',
      description: 'Auth subject of the CMS member this key acts as.',
    },
  },
})

export const revokeMcpKey = defineArgs({
  description: 'Revoke an MCP bearer token.',
  args: {
    id: v.string(),
  },
})
