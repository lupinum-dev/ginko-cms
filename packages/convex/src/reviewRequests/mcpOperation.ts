import type { Doc, Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

const MCP_OPERATION_KEY_PATTERN = /^[\w-]{32,128}$/u

type ReviewRequestDoc = Doc<'reviewRequests'>

type McpReviewRequestIdentity = {
  agentRunId: Id<'agentRuns'>
  entryId: string
  expectedVersion: number
  locales: string[]
  message: string | null
  requestedBy: string
  summary: string
  title: string
}

function assertMatchingRequest(request: ReviewRequestDoc, expected: McpReviewRequestIdentity) {
  const sameLocales =
    request.locales.length === expected.locales.length &&
    request.locales.every((value, index) => value === expected.locales[index])
  if (
    request.agentRunId !== expected.agentRunId ||
    request.entryId !== expected.entryId ||
    request.expectedVersion !== expected.expectedVersion ||
    !sameLocales ||
    (request.message ?? null) !== expected.message ||
    request.requestedBy !== expected.requestedBy ||
    request.summary !== expected.summary ||
    request.title !== expected.title
  ) {
    throwCmsError(
      'MCP_OPERATION_CONFLICT',
      'The operation key is already bound to a different review request.',
    )
  }
}

export async function resolveMcpReviewRetry(
  ctx: QueryOrMutationCtx,
  args: {
    origin: string
    operationKey: string | undefined
    request: Omit<McpReviewRequestIdentity, 'agentRunId'> & {
      agentRunId: Id<'agentRuns'> | null
    }
  },
) {
  if (args.origin !== 'mcp') {
    if (args.operationKey !== undefined) {
      throwCmsError(
        'MCP_OPERATION_KEY_FORBIDDEN',
        'Operation keys are reserved for MCP review requests.',
      )
    }
    return null
  }
  if (!args.operationKey || !MCP_OPERATION_KEY_PATTERN.test(args.operationKey)) {
    throwCmsError('MCP_OPERATION_KEY_INVALID', 'MCP publish review requires a valid operation key.')
  }
  if (!args.request.agentRunId) throw new Error('MCP review operation lost its active agent run.')

  const existing = await ctx.db
    .query('reviewRequests')
    .withIndex('by_mcp_operation_key', (q) => q.eq('mcpOperationKey', args.operationKey))
    .unique()
  if (existing) {
    assertMatchingRequest(existing, {
      ...args.request,
      agentRunId: args.request.agentRunId,
    })
  }
  return { operationKey: args.operationKey, existing }
}
