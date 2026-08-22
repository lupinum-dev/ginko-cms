import { handleMcpRequest, runMcpTool, type McpAccessVerifier } from '@lupinum/better-convex-mcp'
import { cmsMcpCaller, type CmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

const readScope = 'cms.read'
const writeScope = 'cms.entries.edit'
const jsonRecord = z.record(z.string(), z.json())
const nodeKind = z.enum(['page', 'folder', 'group', 'section'])
const operationKeySchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[\w-]+$/u)
const reviewInteractionSchema = z.enum([
  'client_interaction_unsupported',
  'complete',
  'pending_external_review',
  'stale',
])
const projectedReviewSchema = z.object({
  id: z.string(),
  isStale: z.boolean(),
  status: z.enum(['pending', 'approved', 'rejected']),
})

export type GinkoMcpOperations = {
  startAgentRun(args: {
    caller: CmsMcpCaller
    taskName: string
    expiresAt?: number | null
  }): Promise<unknown>
  completeAgentRun(args: { caller: CmsMcpCaller; agentRunId: string }): Promise<unknown>
  getEntry(args: { caller: CmsMcpCaller; id: string; locale?: string }): Promise<unknown>
  saveEntryDraft(args: {
    caller: CmsMcpCaller
    agentRunId: string
    entryId: string
    expectedDraftVersion: number
    patch: {
      shared?: {
        parentEntryId?: string | null
        orderRank?: string | null
        slug?: string | null
        shared?: JsonObject
        nodeKind?: 'page' | 'folder' | 'group' | 'section'
      }
      locales?: Record<
        string,
        {
          slug?: string | null
          values?: JsonObject
          bodyMdc?: string | null
        }
      >
    }
  }): Promise<unknown>
  previewPublish(args: {
    caller: CmsMcpCaller
    agentRunId: string
    entryId: string
    locales: string[]
    expectedVersion: number
    message?: string
  }): Promise<unknown>
  requestPublishReview(args: {
    caller: CmsMcpCaller
    agentRunId: string
    operationKey: string
    entryId: string
    locales: string[]
    expectedVersion: number
    message?: string
    title: string
    summary: string
  }): Promise<unknown>
  getReviewStatus(args: { caller: CmsMcpCaller; reviewRequestId: string }): Promise<unknown>
}

function requiredScopeResult(scope: string) {
  return {
    content: [{ type: 'text' as const, text: 'The credential does not permit this operation.' }],
    isError: true,
    structuredContent: {
      ok: false,
      error: { category: 'auth', code: 'MCP_CAPABILITY_REQUIRED', scope },
    },
  }
}

function expectedApplicationFailure(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const data = Object.getOwnPropertyDescriptor(error, 'data')?.value
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const code = Object.getOwnPropertyDescriptor(data, 'code')?.value
  if (code !== 'ENTRY_DRAFT_VERSION_CONFLICT') return null
  return {
    content: [{ type: 'text' as const, text: 'The draft changed. Reload it before saving again.' }],
    isError: true,
    structuredContent: {
      ok: false,
      error: { category: 'conflict', code, retryable: true },
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function supportsUrlInteraction(context: ServerContext): boolean {
  const envelope = context.mcpReq.envelope
  if (!isPlainObject(envelope)) return false
  const capabilities = Reflect.get(envelope, CLIENT_CAPABILITIES_META_KEY)
  if (!isPlainObject(capabilities)) return false
  const elicitation = Reflect.get(capabilities, 'elicitation')
  return isPlainObject(elicitation) && isPlainObject(Reflect.get(elicitation, 'url'))
}

type ProjectedReview = {
  _id: string
  isStale: boolean
  status: 'pending' | 'approved' | 'rejected'
}

function requireProjectedReview(value: unknown): ProjectedReview {
  if (!isPlainObject(value)) throw new Error('MCP_REVIEW_RESULT_INVALID')
  const id = Reflect.get(value, '_id')
  const isStale = Reflect.get(value, 'isStale')
  const status = Reflect.get(value, 'status')
  if (
    typeof id !== 'string' ||
    typeof isStale !== 'boolean' ||
    (status !== 'pending' && status !== 'approved' && status !== 'rejected')
  ) {
    throw new Error('MCP_REVIEW_RESULT_INVALID')
  }
  return { _id: id, isStale, status }
}

function reviewUrl(base: URL, reviewRequestId: string) {
  return new URL(encodeURIComponent(reviewRequestId), base).href
}

function projectReviewResult(review: unknown, supportsInteraction: boolean): CallToolResult {
  const projected = requireProjectedReview(review)
  const interaction = projected.isStale
    ? 'stale'
    : projected.status === 'pending'
      ? supportsInteraction
        ? 'pending_external_review'
        : 'client_interaction_unsupported'
      : 'complete'
  const text =
    interaction === 'client_interaction_unsupported'
      ? 'Created the review request. This client cannot open the application review; a publisher can review it in Ginko Studio.'
      : interaction === 'pending_external_review'
        ? 'The review request is waiting for a publisher decision in Ginko Studio.'
        : interaction === 'stale'
          ? 'The review request is stale and must be recreated.'
          : `The review request is ${projected.status}.`
  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      interaction,
      review: {
        id: projected._id,
        isStale: projected.isStale,
        status: projected.status,
      },
    },
  }
}

function projectReviewInput(
  review: unknown,
  operationKey: string,
  interactionBase: URL,
): CallToolResult | InputRequiredResult {
  const projected = requireProjectedReview(review)
  if (projected.status !== 'pending' || projected.isStale) {
    return projectReviewResult(review, true)
  }
  return inputRequired({
    inputRequests: {
      review: inputRequired.elicitUrl({
        message: 'Review this publish request in Ginko Studio.',
        url: reviewUrl(interactionBase, projected._id),
      }),
    },
    requestState: operationKey,
  })
}

export async function handleGinkoMcpRequest(
  request: Request,
  options: {
    authorization: {
      issuer: string
      verifier: McpAccessVerifier
    }
    operations: GinkoMcpOperations
    reviewInteractionBase: URL
    resource: URL
  },
): Promise<Response> {
  const { authorization, operations, resource, reviewInteractionBase } = options
  if (
    reviewInteractionBase.protocol !== 'https:' ||
    reviewInteractionBase.username ||
    reviewInteractionBase.password ||
    reviewInteractionBase.search ||
    reviewInteractionBase.hash ||
    !reviewInteractionBase.pathname.endsWith('/')
  ) {
    throw new Error('The review interaction base must be a canonical HTTPS URL ending in a slash.')
  }
  return await handleMcpRequest(request, {
    serverInfo: { name: 'ginko-cms', version: '0.1.0' },
    resource,
    authorization: {
      mode: 'oauth',
      issuer: authorization.issuer,
      resourceName: 'Ginko CMS MCP',
      scopesSupported: [...mcpDelegatedScopeKeys],
      verifier: authorization.verifier,
    },
    configureServer(access, server) {
      const caller = cmsMcpCaller({
        issuer: access.issuer,
        userId: access.subject,
        clientId: access.clientId,
        scopes: access.scopes,
      })
      server.registerTool(
        'start-agent-run',
        {
          description: 'Start a bounded work session for subsequent CMS writes.',
          inputSchema: z
            .object({
              taskName: z.string().min(1).max(200),
              expiresAt: z.number().nullable().optional(),
            })
            .strict(),
          outputSchema: z.object({ run: z.unknown() }),
        },
        async (args) => {
          if (!access.scopes.includes(readScope)) return requiredScopeResult(readScope)
          return await runMcpTool(async () => ({
            content: [{ type: 'text', text: 'Started the agent run.' }],
            structuredContent: {
              run: await operations.startAgentRun({
                caller,
                ...args,
              }),
            },
          }))
        },
      )
      server.registerTool(
        'get-entry',
        {
          description: 'Load one CMS entry.',
          inputSchema: z.object({ entryId: z.string(), locale: z.string().optional() }),
          outputSchema: z.object({ entry: z.unknown().nullable() }),
        },
        async ({ entryId, locale }) => {
          if (!access.scopes.includes(readScope)) return requiredScopeResult(readScope)
          return await runMcpTool(async () => {
            const entry = await operations.getEntry({
              caller,
              id: entryId,
              ...(locale === undefined ? {} : { locale }),
            })
            return {
              content: [
                {
                  type: 'text',
                  text: entry === null ? 'Entry was not found.' : 'Loaded the CMS entry.',
                },
              ],
              structuredContent: { entry },
            }
          })
        },
      )
      server.registerTool(
        'save-entry-draft',
        {
          description: 'Save ordinary draft fields. This does not publish content.',
          inputSchema: z.object({
            agentRunId: z.string(),
            entryId: z.string(),
            expectedDraftVersion: z.number(),
            patch: z.object({
              shared: z
                .object({
                  parentEntryId: z.string().nullable().optional(),
                  orderRank: z.string().nullable().optional(),
                  slug: z.string().nullable().optional(),
                  shared: jsonRecord.optional(),
                  nodeKind: nodeKind.optional(),
                })
                .optional(),
              locales: z
                .record(
                  z.string(),
                  z.object({
                    slug: z.string().nullable().optional(),
                    values: jsonRecord.optional(),
                    bodyMdc: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            }),
          }),
          outputSchema: z.object({ result: z.unknown() }),
        },
        async (args) => {
          if (!access.scopes.includes(writeScope)) return requiredScopeResult(writeScope)
          return await runMcpTool(async () => {
            try {
              const result = await operations.saveEntryDraft({
                caller,
                ...args,
              })
              return {
                content: [{ type: 'text', text: 'Saved the entry draft.' }],
                structuredContent: { result },
              }
            } catch (error) {
              const expected = expectedApplicationFailure(error)
              if (expected) return expected
              throw error
            }
          })
        },
      )
      server.registerTool(
        'preview-publish',
        {
          description: 'Preview publish blockers and public-impact changes without publishing.',
          inputSchema: z
            .object({
              agentRunId: z.string(),
              entryId: z.string(),
              locales: z.array(z.string()).min(1),
              expectedVersion: z.number(),
              message: z.string().optional(),
            })
            .strict(),
          outputSchema: z.object({ preview: z.unknown(), publicChanged: z.literal(false) }),
        },
        async (args) => {
          if (!access.scopes.includes(writeScope)) return requiredScopeResult(writeScope)
          return await runMcpTool(async () => ({
            content: [
              {
                type: 'text',
                text: 'Previewed publish impact without changing public content.',
              },
            ],
            structuredContent: {
              preview: await operations.previewPublish({
                caller,
                ...args,
              }),
              publicChanged: false as const,
            },
          }))
        },
      )
      server.registerTool(
        'complete-agent-run',
        {
          description: 'Complete a previously started CMS work session.',
          inputSchema: z.object({ agentRunId: z.string() }).strict(),
          outputSchema: z.object({ run: z.unknown() }),
        },
        async (args) => {
          if (!access.scopes.includes(readScope)) return requiredScopeResult(readScope)
          return await runMcpTool(async () => ({
            content: [{ type: 'text', text: 'Completed the agent run.' }],
            structuredContent: {
              run: await operations.completeAgentRun({
                caller,
                ...args,
              }),
            },
          }))
        },
      )
      server.registerTool(
        'request-publish-review',
        {
          description:
            'Create one idempotent publish review request. Publishing remains an application-owned publisher decision.',
          inputSchema: z
            .object({
              operationKey: operationKeySchema,
              agentRunId: z.string(),
              entryId: z.string(),
              locales: z.array(z.string()).min(1),
              expectedVersion: z.number(),
              message: z.string().max(2_000).optional(),
              title: z.string().min(1).max(200),
              summary: z.string().min(1).max(1_000),
            })
            .strict(),
          outputSchema: z.object({
            interaction: reviewInteractionSchema,
            review: projectedReviewSchema,
          }),
        },
        async (args, context) =>
          await runMcpTool(async () => {
            if (!access.scopes.includes(writeScope)) return requiredScopeResult(writeScope)
            const echoedState = context.mcpReq.requestState<string>()
            if (echoedState !== undefined && echoedState !== args.operationKey) {
              return {
                content: [{ type: 'text', text: 'The interaction state is invalid.' }],
                isError: true,
                structuredContent: {
                  ok: false,
                  error: { category: 'client', code: 'MCP_INTERACTION_STATE_INVALID' },
                },
              }
            }
            const supportsInteraction = supportsUrlInteraction(context)
            const review = await operations.requestPublishReview({
              caller,
              ...args,
            })
            if (!supportsInteraction) return projectReviewResult(review, false)
            if (echoedState !== undefined && context.mcpReq.inputResponses !== undefined) {
              return projectReviewResult(review, true)
            }
            return projectReviewInput(review, args.operationKey, reviewInteractionBase)
          }),
      )
      server.registerTool(
        'get-review-status',
        {
          description: 'Read one explicit publish review request owned by this MCP caller.',
          inputSchema: z.object({ reviewRequestId: z.string() }).strict(),
          outputSchema: z.object({
            interaction: reviewInteractionSchema,
            review: projectedReviewSchema,
          }),
        },
        async ({ reviewRequestId }) => {
          if (!access.scopes.includes(readScope)) return requiredScopeResult(readScope)
          return await runMcpTool(async () =>
            projectReviewResult(
              await operations.getReviewStatus({
                caller,
                reviewRequestId,
              }),
              false,
            ),
          )
        },
      )
    },
  })
}
