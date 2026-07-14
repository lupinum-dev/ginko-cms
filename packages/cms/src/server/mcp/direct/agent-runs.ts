import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../_shared/agent-tools'

export const startAgentRun = defineMcpTool({
  name: 'start-agent-run',
  description: 'Start a bounded, credential-owned CMS agent run before making changes.',
  inputSchema: {
    taskName: z.string().min(1).max(200),
    expiresAt: z
      .number()
      .describe('Optional earlier expiry as a Unix timestamp in milliseconds; maximum 24 hours.')
      .nullable()
      .optional(),
  },
  group: 'agent-runs',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const run = await context.convex.mutation(api.ginkoCms.agentRuns.startRun, args)
      return ok(run, 'Started agent run.')
    } catch (error) {
      return failFromError(error, 'Failed to start agent run.')
    }
  },
})

export const listAgentRuns = defineMcpTool({
  name: 'list-agent-runs',
  description: 'List agent runs owned by the current MCP credential.',
  inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  group: 'agent-runs',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const runs = await context.convex.query(api.ginkoCms.agentRuns.listOwnRuns, args)
      return ok({ runs }, `Listed ${runs.length} agent run${runs.length === 1 ? '' : 's'}.`)
    } catch (error) {
      return failFromError(error, 'Failed to list agent runs.')
    }
  },
})

export const completeAgentRun = defineMcpTool({
  name: 'complete-agent-run',
  description: 'Complete an active agent run owned by the current MCP credential.',
  inputSchema: { agentRunId: z.string() },
  group: 'agent-runs',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const run = await context.convex.mutation(api.ginkoCms.agentRuns.completeRun, args)
      return ok(run, 'Completed agent run.')
    } catch (error) {
      return failFromError(error, 'Failed to complete agent run.')
    }
  },
})
