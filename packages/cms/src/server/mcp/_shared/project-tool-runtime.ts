import {
  cmsMcpConvexAuthIssuer,
  type CmsCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import {
  defineMcpTool,
  type McpToolCallbackResult,
  type McpToolDefinitionListItem,
} from '@nuxtjs/mcp-toolkit/server'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'
import { z, type ZodRawShape, type ZodTypeAny } from 'zod'

import { components } from '#convex/api'

import { getMcpAuth } from './auth.js'
import type { CmsMcpCapabilities } from './capabilities.js'
import { createAdminConvexCaller } from './convex-caller.js'
import { getMcpCmsCallerFromAuth, resolveCmsMcpCapabilitiesForCmsCaller } from './runtime.js'

export function getMcpCmsCaller(event?: H3Event): CmsCaller {
  return getMcpCmsCallerFromAuth(getMcpAuth(event))
}

export type McpConvexCaller = ReturnType<typeof createAdminConvexCaller>
export type ProjectToolDefinition = McpToolDefinitionListItem

type ConvexFunctionRef = FunctionReference<'action' | 'mutation' | 'query', 'internal' | 'public'>
type ConvexMutationRef = FunctionReference<'mutation', 'internal' | 'public'>
type ProjectToolRuntime = Record<string, never>
type SchemaDefinition = {
  description?: string
  args: PropertyValidators
  meta?: {
    fields?: Record<
      string,
      {
        description?: string
        examples?: unknown[]
      }
    >
  }
}
type ProjectToolCtx = {
  capabilities: CmsMcpCapabilities
  caller: CmsCaller
  runtime: ProjectToolRuntime
}
type ProjectToolErrorCode =
  | 'auth'
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'conflict'
  | 'scope_exceeded'
  | 'confirmation_required'
  | 'cooldown'
  | 'unknown'
type ProjectToolErrorIssue = {
  code?: string
  message: string
  path?: string
}
type ProjectToolDenialExplanation = {
  decision: 'guard' | 'authorize' | 'rls' | 'service' | 'tool' | 'destructive_confirm'
  message: string
  policy?: string
  reasonCode:
    | 'guard.auth_required'
    | 'guard.denied'
    | 'authorize.denied'
    | 'rls.denied'
    | 'service.access.denied'
    | 'tool.capability_denied'
    | 'tool.disabled'
    | 'tool.confirmation_mismatch'
    | 'tool.execution_failed'
    | 'query.failed'
    | 'mutation.failed'
    | 'action.failed'
    | 'upload.failed'
    | 'operation.execute.failed'
  suggestedAction?:
    | 'sign_in'
    | 'invite_to_workspace'
    | 'grant_capability'
    | 'switch_workspace'
    | 'retry_with_confirmation'
    | 'contact_admin'
  workspaceId?: string
}
type ProjectToolEnabledCtx = ProjectToolCtx & {
  event: H3Event
}
type ProjectToolArgs<S extends SchemaDefinition> = {
  [K in keyof S['args']]: unknown
}
type ProjectToolRespondCtx<
  S extends SchemaDefinition,
  TCall extends ConvexFunctionRef,
> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
  result: FunctionReturnType<TCall>
  ok: (data: unknown, summary?: string) => McpToolCallbackResult
  error: (
    category: ProjectToolErrorCode,
    message: string,
    issues?: ProjectToolErrorIssue[],
    explanation?: ProjectToolDenialExplanation,
    details?: Record<string, unknown>,
    code?: string,
  ) => McpToolCallbackResult
}
type ProjectToolResultCtx<
  S extends SchemaDefinition,
  TCall extends ConvexFunctionRef,
> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
  result: FunctionReturnType<TCall>
}
type ProjectToolPreviewResolverCtx<S extends SchemaDefinition> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
}
type ProjectToolOperation<
  TCall extends ConvexFunctionRef,
  TPreview extends ConvexMutationRef | undefined,
> = {
  execute: TCall
  preview?: TPreview
}
type ProjectToolOptions<
  S extends SchemaDefinition,
  TCall extends ConvexFunctionRef = ConvexFunctionRef,
  TPreview extends ConvexMutationRef | undefined = undefined,
> = {
  capability?: keyof CmsMcpCapabilities
  enabled?: (ctx: ProjectToolEnabledCtx) => boolean | Promise<boolean>
  schema: S
  call?: TCall
  operation?: ProjectToolOperation<TCall, TPreview> | 'query' | 'mutation'
  meta?: {
    name?: string
    description?: string
    destructive?: boolean
  }
  preview?:
    | TPreview
    | ((ctx: ProjectToolPreviewResolverCtx<S>) => unknown | Promise<unknown> | string)
  mapResult?: (ctx: ProjectToolResultCtx<S, TCall>) => unknown
  respond?: (ctx: ProjectToolRespondCtx<S, TCall>) => McpToolCallbackResult
  summary?: (ctx: ProjectToolResultCtx<S, TCall>) => string | undefined
  group?: string
  tags?: string[]
}

export async function resolveCmsMcpCapabilities(
  caller: CmsCaller,
  convex: McpConvexCaller,
): Promise<CmsMcpCapabilities> {
  return await resolveCmsMcpCapabilitiesForCmsCaller(
    caller,
    async () => await convex.query(components.ginkoCms.members.getAccessContext, {}),
  )
}

export function createMcpConvexCaller(event: H3Event, mcpKeyId: string): McpConvexCaller {
  return createAdminConvexCaller(event, {
    subject: mcpKeyId,
    issuer: cmsMcpConvexAuthIssuer,
  })
}

function getMcpConvexCaller(event: H3Event, caller: CmsCaller): McpConvexCaller {
  if (caller.kind !== 'mcp') {
    return createAdminConvexCaller(event)
  }
  return createMcpConvexCaller(event, caller.mcpKeyId)
}

export async function getMcpToolContext(event: H3Event): Promise<{
  capabilities: CmsMcpCapabilities
  convex: McpConvexCaller
  caller: CmsCaller
  runtime: ProjectToolRuntime
}> {
  const caller = getMcpCmsCaller(event)
  const convex = getMcpConvexCaller(event, caller)
  const capabilities = await resolveCmsMcpCapabilities(caller, convex)
  return {
    capabilities,
    convex,
    caller,
    runtime: {},
  }
}

function zodFromConvexValidator(validator: unknown): ZodTypeAny {
  const node = validator as {
    kind?: string
    isOptional?: 'optional' | 'required'
    value?: unknown
    element?: unknown
    members?: unknown[]
    fields?: Record<string, unknown>
    key?: unknown
    valueValidator?: unknown
  }

  let schema: ZodTypeAny
  switch (node.kind) {
    case 'string':
    case 'id':
      schema = z.string()
      break
    case 'float64':
    case 'number':
    case 'int64':
      schema = z.number()
      break
    case 'boolean':
      schema = z.boolean()
      break
    case 'null':
      schema = z.null()
      break
    case 'literal':
      schema =
        typeof node.value === 'string' ||
        typeof node.value === 'number' ||
        typeof node.value === 'boolean'
          ? z.literal(node.value)
          : z.unknown()
      break
    case 'array':
      schema = z.array(zodFromConvexValidator(node.element))
      break
    case 'object':
      schema = z.object(zodRawShapeFromValidators(node.fields ?? {}))
      break
    case 'record':
      schema = z.record(z.string(), zodFromConvexValidator(node.value ?? node.valueValidator))
      break
    case 'union': {
      const members = (node.members ?? []).map(zodFromConvexValidator)
      schema =
        members.length === 0
          ? z.unknown()
          : members.length === 1
            ? members[0]!
            : z.union(members as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
      break
    }
    default:
      schema = z.unknown()
  }

  return node.isOptional === 'optional' ? schema.optional() : schema
}

function zodRawShapeFromValidators(validators: Record<string, unknown>): ZodRawShape {
  return Object.fromEntries(
    Object.entries(validators).map(([key, validator]) => [key, zodFromConvexValidator(validator)]),
  )
}

function inputSchemaForTool(schema: SchemaDefinition, destructive: boolean): ZodRawShape {
  return {
    ...zodRawShapeFromValidators(schema.args),
    ...(destructive
      ? {
          _confirmationToken: z
            .string()
            .optional()
            .describe('Confirmation token returned by the CMS operation preview.'),
        }
      : {}),
  }
}

function ok(data: unknown, summary = 'Done.'): McpToolCallbackResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: data as Record<string, unknown>,
  }
}

function errorResult(
  category: ProjectToolErrorCode,
  message: string,
  issues: ProjectToolErrorIssue[] = [],
  _explanation?: ProjectToolDenialExplanation,
  details: Record<string, unknown> = {},
  code?: string,
): McpToolCallbackResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    structuredContent: {
      ok: false,
      error: {
        category,
        ...(code ? { code } : {}),
        message,
        retryable: ['network', 'server', 'rate_limit', 'conflict'].includes(category),
        ...(issues.length ? { issues } : {}),
        ...(Object.keys(details).length ? { details } : {}),
      },
    },
  }
}

function stripConfirmationToken(args: Record<string, unknown>): Record<string, unknown> {
  const { _confirmationToken: _confirmationToken, ...rest } = args
  return rest
}

export function projectTool<
  S extends SchemaDefinition,
  TCall extends ConvexFunctionRef = ConvexFunctionRef,
  TPreview extends ConvexMutationRef | undefined = undefined,
>(tool: ProjectToolOptions<S, TCall, TPreview>): ProjectToolDefinition {
  const name = tool.meta?.name
  const destructive = tool.meta?.destructive === true
  const operation = tool.operation

  if (destructive && (typeof operation !== 'object' || !operation.preview)) {
    throw new Error(
      `[ginko-cms] Destructive MCP tool "${name ?? 'project-tool'}" needs explicit preview and execute refs.`,
    )
  }

  if (!tool.call && !operation) {
    throw new Error(
      `[ginko-cms] MCP tool "${name ?? 'project-tool'}" needs a Convex call or operation ref.`,
    )
  }

  return defineMcpTool({
    name,
    description: tool.meta?.description ?? tool.schema.description,
    inputSchema: inputSchemaForTool(tool.schema, destructive),
    group: tool.group,
    tags: tool.tags,
    annotations: destructive ? { destructiveHint: true } : undefined,
    enabled: async (event) => {
      const context = await getMcpToolContext(event)
      if (tool.capability && context.capabilities[tool.capability] !== true) return false
      if (!tool.enabled) return true
      return await tool.enabled({ ...context, event })
    },
    handler: async (rawArgs, extra) => {
      const event = extra.event
      const context = await getMcpToolContext(event)
      const args = (rawArgs ?? {}) as Record<string, unknown>

      if (tool.capability && context.capabilities[tool.capability] !== true) {
        return errorResult(
          'auth',
          `Caller does not have the ${String(tool.capability)} capability.`,
          [],
          undefined,
          { capability: String(tool.capability) },
          'MCP_CAPABILITY_REQUIRED',
        )
      }

      if (tool.enabled && !(await tool.enabled({ ...context, event }))) {
        return errorResult('auth', 'MCP tool is disabled for this caller.', [], undefined, {
          tool: name ?? 'project-tool',
        })
      }

      if (destructive) {
        const destructiveOperation = operation as ProjectToolOperation<TCall, TPreview>
        const confirmationToken = args._confirmationToken
        const operationArgs = stripConfirmationToken(args)
        if (typeof confirmationToken !== 'string' || confirmationToken.length === 0) {
          const preview =
            typeof tool.preview === 'function'
              ? await tool.preview({ ...context, args: operationArgs as ProjectToolArgs<S> })
              : await context.convex.mutation(destructiveOperation.preview!, operationArgs as never)
          return errorResult(
            'confirmation_required',
            'CMS operation preview requires confirmation before execution.',
            [],
            undefined,
            { preview },
            'CMS_CONFIRMATION_REQUIRED',
          )
        }
        const result = await context.convex.mutation(
          destructiveOperation.execute as never,
          {
            ...operationArgs,
            _confirmationToken: confirmationToken,
          } as never,
        )
        return respond(tool, context, operationArgs, result)
      }

      if (typeof operation === 'object') {
        const result = await context.convex.mutation(operation.execute as never, args as never)
        return respond(tool, context, args, result)
      }

      if (operation === 'mutation') {
        throw new Error(
          `[ginko-cms] Direct MCP mutation "${name ?? 'project-tool'}" must be backed by an explicit operation.`,
        )
      }

      const call = tool.call
      if (!call) {
        throw new Error(
          `[ginko-cms] MCP query "${name ?? 'project-tool'}" needs a Convex call ref.`,
        )
      }

      const result =
        call._type === 'action'
          ? await context.convex.action(call as never, args as never)
          : await context.convex.query(call as never, args as never)
      return respond(tool, context, args, result)
    },
  })
}

function respond<S extends SchemaDefinition, TCall extends ConvexFunctionRef>(
  tool: ProjectToolOptions<S, TCall, ConvexMutationRef | undefined>,
  context: ProjectToolCtx,
  args: Record<string, unknown>,
  result: unknown,
): McpToolCallbackResult {
  const typedArgs = args as ProjectToolArgs<S>
  const mappedResult = tool.mapResult
    ? tool.mapResult({
        ...context,
        args: typedArgs,
        result: result as FunctionReturnType<TCall>,
      })
    : result

  if (tool.respond) {
    return tool.respond({
      ...context,
      args: typedArgs,
      result: mappedResult as FunctionReturnType<TCall>,
      ok,
      error: errorResult,
    })
  }

  return ok(
    mappedResult,
    tool.summary?.({
      ...context,
      args: typedArgs,
      result: mappedResult as FunctionReturnType<TCall>,
    }),
  )
}
