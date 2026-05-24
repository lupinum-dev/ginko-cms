import {
  cmsMcpConvexAuthIssuer,
  type CmsCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import { executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'
import type { OperationKind } from '@lupinum/trellis/backend'
import {
  defineMcpApp,
  stampMcpToolSafety,
  type AnyConvexSchema,
  type InferSchemaData,
  type McpConvexCaller,
  type TrellisMcpToolSafety,
} from '@lupinum/trellis/mcp'
import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'
import type { FunctionReference, FunctionReturnType } from 'convex/server'
import type { PropertyValidators } from 'convex/values'
import type { H3Event } from 'h3'

import { internal } from '#trellis/api'

import { getMcpAuth } from './auth.js'
import type { CmsMcpCapabilities } from './capabilities.js'
import { createAdminConvexCaller } from './convex-caller.js'
import { getMcpCmsCallerFromAuth, resolveCmsMcpCapabilitiesForCmsCaller } from './runtime.js'

export function getMcpCmsCaller(event?: H3Event): CmsCaller {
  return getMcpCmsCallerFromAuth(getMcpAuth(event))
}

type PreviewResult = string | { summary?: string; [key: string]: unknown }
type CmsMcpOperation = {
  args: PropertyValidators
  id?: string
  name?: string
  kind?: OperationKind
}
type ProjectToolDirectOperation = 'query' | 'mutation'

export async function resolveCmsMcpCapabilities(
  caller: CmsCaller,
  convex: McpConvexCaller,
): Promise<CmsMcpCapabilities> {
  return await resolveCmsMcpCapabilitiesForCmsCaller(
    caller,
    async () => await convex.query(internal.ginkoCmsMcp.getAccessContext, {}),
  )
}

function getMcpConvexCaller(event: H3Event, caller: CmsCaller): McpConvexCaller {
  const convex = createAdminConvexCaller(
    event,
    caller.kind === 'mcp'
      ? {
          subject: caller.mcpKeyId,
          issuer: cmsMcpConvexAuthIssuer,
        }
      : undefined,
  )
  const stripRuntimeArgs = <TArgs>(args: TArgs): TArgs => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return args
    const record = args as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(record, 'caller')) return args
    const { caller: _caller, ...rest } = record
    return rest as TArgs
  }

  return {
    query: async (fn, args) => await convex.query(fn, stripRuntimeArgs(args)),
    mutation: async (fn, args) => await convex.mutation(fn, stripRuntimeArgs(args)),
    action: async (fn, args) => await convex.action(fn, stripRuntimeArgs(args)),
  } as McpConvexCaller
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

export type ProjectToolDefinition = McpToolDefinitionListItem

type ConvexFunctionRef = FunctionReference<'action' | 'mutation' | 'query', 'internal' | 'public'>
type ProjectToolRuntime = Record<string, never>
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

type ProjectToolArgs<S extends AnyConvexSchema> = InferSchemaData<S>

type ProjectToolRespondCtx<
  S extends AnyConvexSchema,
  TCall extends ConvexFunctionRef,
> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
  result: FunctionReturnType<TCall>
  ok: (data: unknown, summary?: string) => unknown
  error: (
    category: ProjectToolErrorCode,
    message: string,
    issues?: ProjectToolErrorIssue[],
    explanation?: ProjectToolDenialExplanation,
    details?: Record<string, unknown>,
    code?: string,
  ) => unknown
}

type ProjectToolPreviewCtx<
  S extends AnyConvexSchema,
  TPreview extends ConvexFunctionRef,
> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
  result: FunctionReturnType<TPreview>
}

type ProjectToolResultCtx<
  S extends AnyConvexSchema,
  TCall extends ConvexFunctionRef,
> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
  result: FunctionReturnType<TCall>
}

type ProjectToolPreviewResolverCtx<S extends AnyConvexSchema> = ProjectToolCtx & {
  args: ProjectToolArgs<S>
}

type ProjectToolOptions<
  S extends AnyConvexSchema,
  TCall extends ConvexFunctionRef,
  TPreview extends ConvexFunctionRef | undefined = undefined,
> = {
  capability?: keyof CmsMcpCapabilities
  enabled?: (ctx: ProjectToolEnabledCtx) => boolean | Promise<boolean>
  schema: S
  call: TCall
  operation?: CmsMcpOperation | ProjectToolDirectOperation
  safety?: TrellisMcpToolSafety
  meta?: {
    name?: string
    description?: string
    destructive?: boolean
  }
  preview?:
    | TPreview
    | ((
        ctx: ProjectToolPreviewResolverCtx<S>,
      ) => PreviewResult | Promise<PreviewResult | string> | string)
  previewResult?: TPreview extends ConvexFunctionRef
    ? (ctx: ProjectToolPreviewCtx<S, TPreview>) => PreviewResult | string
    : never
  mapResult?: (ctx: ProjectToolResultCtx<S, TCall>) => unknown
  respond?: (ctx: ProjectToolRespondCtx<S, TCall>) => unknown
  summary?: (ctx: ProjectToolResultCtx<S, TCall>) => string | undefined
  [key: string]: unknown
}

const rawMcpRuntime = defineMcpApp<CmsCaller, CmsMcpCapabilities>({
  callConvex: async (event, context): Promise<McpConvexCaller> =>
    getMcpConvexCaller(event, context.caller),
  resolveCaller: async (event): Promise<CmsCaller> => getMcpCmsCaller(event),
  resolveAccess: async ({ caller, convex }) => await resolveCmsMcpCapabilities(caller, convex),
  callerKey: (caller) => (caller.kind === 'mcp' ? caller.mcpKeyId : caller.kind),
  scopeKey: () => 'global',
})

export function projectTool<
  S extends AnyConvexSchema,
  TCall extends ConvexFunctionRef,
  TPreview extends ConvexFunctionRef | undefined = undefined,
>(tool: ProjectToolOptions<S, TCall, TPreview>): ProjectToolDefinition {
  const { capability, enabled, ...rest } = tool
  const wrappedEnabled = async (ctx: {
    recordAccess: CmsMcpCapabilities
    event: H3Event
    caller: CmsCaller
    runtime: ProjectToolRuntime
  }) => {
    if (capability && ctx.recordAccess[capability] !== true) {
      return false
    }

    if (!enabled) {
      return true
    }

    return await enabled({
      capabilities: ctx.recordAccess,
      event: ctx.event,
      caller: ctx.caller,
      runtime: ctx.runtime,
    })
  }

  if (tool.meta?.destructive) {
    if (!tool.preview || typeof tool.preview === 'function') {
      throw new Error('[ginko-cms] Destructive MCP tools require a Convex preview ref')
    }
    const operation = tool.operation
    if (!operation || typeof operation === 'string') {
      throw new Error('[ginko-cms] Destructive MCP tools require an explicit operation')
    }
    const {
      call,
      preview,
      operation: _operation,
      confirmationMode: _confirmationMode,
      ...operationOptions
    } = rest

    return rawMcpRuntime.tool.operation(operation, {
      ...operationOptions,
      confirmationMode: 'backend',
      execute: executeOperationRef(operation, call),
      preview: previewOperationRef(operation, preview),
      previewOperation: 'mutation',
      enabled: wrappedEnabled,
    }) as ProjectToolDefinition
  }

  const directOperation = tool.operation === 'query' ? 'query' : 'mutation'
  const { operation: _operation, safety, call, ...directOptions } = rest

  if (directOperation === 'query') {
    return rawMcpRuntime.tool.query({
      ...directOptions,
      call,
      enabled: wrappedEnabled,
    }) as ProjectToolDefinition
  }

  if (!safety) {
    throw new Error(
      `[ginko-cms] Direct MCP mutation "${tool.meta?.name ?? 'project-tool'}" requires bounded-write safety.`,
    )
  }

  return rawMcpRuntime.tool.mutation({
    ...directOptions,
    call: stampMcpToolSafety(call, safety),
    safety,
    enabled: wrappedEnabled,
  }) as ProjectToolDefinition
}
