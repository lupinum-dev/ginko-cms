import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { McpToolCallbackResult } from '@nuxtjs/mcp-toolkit/server'
import { normalizeConvexError, type ConvexCallErrorKind } from 'better-convex-nuxt/errors'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import {
  assertHostContractWritable,
  GinkoCmsContractWriteBlockedError,
  type GinkoCmsExpectedContractHashes,
  type GinkoCmsInstalledContractStatus,
} from '../../../public/contract-compatibility.js'
import { classifyGinkoError } from '../../../public/error-classification.js'
import { getMcpAuth, type McpConvexCaller } from './auth.js'
import type { CmsMcpCapabilities } from './capabilities.js'
import { redactMcpResponse } from './response-redaction.js'
import { getMcpCmsCallerFromAuth, resolveCmsMcpCapabilitiesForCmsCaller } from './runtime.js'

type JsonRecord = Record<string, unknown>
export type AgentMcpContext = Awaited<ReturnType<typeof getMcpToolContext>>

type McpErrorCategory =
  | 'auth'
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'conflict'
  | 'unknown'

export class AgentToolError extends Error {
  category: McpErrorCategory
  code: string
  details?: Record<string, unknown>
  suggestedAction?: string

  constructor(
    code: string,
    message: string,
    options: {
      category?: McpErrorCategory
      details?: Record<string, unknown>
      suggestedAction?: string
    } = {},
  ) {
    super(message)
    this.name = 'AgentToolError'
    this.code = code
    this.category = options.category ?? 'validation'
    this.details = options.details
    this.suggestedAction = options.suggestedAction
  }
}

function getMcpCmsCaller(event?: H3Event): CmsCaller {
  return getMcpCmsCallerFromAuth(getMcpAuth(event))
}

function getMcpConvexCaller(event: H3Event, caller: CmsCaller): McpConvexCaller {
  const auth = getMcpAuth(event)
  if (caller.kind !== 'mcp') {
    throw new Error('MCP Convex calls require MCP authentication.')
  }
  if (!auth || auth.apiKeyId !== caller.apiKeyId) {
    throw new Error('MCP Convex calls require matching MCP authentication.')
  }
  return auth.caller
}

async function resolveCmsMcpCapabilities(
  caller: CmsCaller,
  convex: McpConvexCaller,
): Promise<CmsMcpCapabilities> {
  return await resolveCmsMcpCapabilitiesForCmsCaller(
    caller,
    async () => await convex.query(api.ginkoCms.members.getAccessContext, {}),
  )
}

function expectedMcpContractHashes(event: H3Event): GinkoCmsExpectedContractHashes {
  const runtimeConfig = useRuntimeConfig(event) as {
    public?: { ginkoCms?: { contract?: Partial<GinkoCmsExpectedContractHashes> } }
  }
  const expected = runtimeConfig.public?.ginkoCms?.contract
  if (
    typeof expected?.expectedContentHash !== 'string' ||
    typeof expected.expectedPresentationHash !== 'string'
  ) {
    throwAgentToolError(
      'CMS_EXPECTED_CONTRACT_MISSING',
      'CMS writes are unavailable because the host did not provide expected contract hashes.',
      { category: 'server' },
    )
  }
  return {
    expectedContentHash: expected.expectedContentHash,
    expectedPresentationHash: expected.expectedPresentationHash,
  }
}

export function createContractGuardedMcpCaller(
  convex: McpConvexCaller,
  getExpected: () => GinkoCmsExpectedContractHashes,
): McpConvexCaller {
  const assertWritable = async () => {
    try {
      await assertHostContractWritable(
        getExpected(),
        async (): Promise<GinkoCmsInstalledContractStatus> =>
          await convex.query(api.ginkoCms.contract.getInstalledContractStatus, {}),
      )
    } catch (error) {
      if (!(error instanceof GinkoCmsContractWriteBlockedError)) throw error
      const compatibility = error.compatibility
      throwAgentToolError(error.code, error.message, {
        category: 'conflict',
        details: {
          blockers: compatibility.blockers,
          installedContentHash: compatibility.installedContentHash,
          installedPresentationHash: compatibility.installedPresentationHash,
          expectedContentHash: compatibility.expectedContentHash,
          expectedPresentationHash: compatibility.expectedPresentationHash,
          transitionState: compatibility.transitionState,
          transitionRunId: compatibility.transitionRunId,
        },
        suggestedAction: 'Ask an owner to run `ginko-cms push --check` and repair the contract.',
      })
    }
  }
  const mutation: McpConvexCaller['mutation'] = async (reference, args) => {
    await assertWritable()
    return await convex.mutation(reference, args)
  }
  const action: McpConvexCaller['action'] = async (reference, args) => {
    await assertWritable()
    return await convex.action(reference, args)
  }
  return {
    query: convex.query,
    mutation,
    action,
  }
}

export async function getMcpToolContext(event: H3Event): Promise<{
  capabilities: CmsMcpCapabilities
  convex: McpConvexCaller
  caller: CmsCaller
  runtime: Record<string, never>
}> {
  const caller = getMcpCmsCaller(event)
  const rawConvex = getMcpConvexCaller(event, caller)
  const capabilities = await resolveCmsMcpCapabilities(caller, rawConvex)
  const convex = createContractGuardedMcpCaller(rawConvex, () => expectedMcpContractHashes(event))
  return {
    capabilities,
    convex,
    caller,
    runtime: {},
  }
}

export function throwAgentToolError(
  code: string,
  message: string,
  options?: ConstructorParameters<typeof AgentToolError>[2],
): never {
  throw new AgentToolError(code, message, options)
}

export function ok(data: unknown, summary: string): McpToolCallbackResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: redactMcpResponse(data) as Record<string, unknown>,
  }
}

function cleanErrorMessage(message: string): string {
  let cleaned = message
    .replace(/^\[server\w+\]\s*(?:Request failed for \S+ via \S+\.\s*)?/, '')
    .replace(/\[Request ID: [^\]]+\]\s*/g, '')
    .replace(/\n\s+at .+/g, '')
    .trim()

  const uncaughtMatch = cleaned.match(/(?:Uncaught )?Error:\s*(.+)/)
  if (uncaughtMatch) {
    cleaned = uncaughtMatch[1]!.trim()
  }

  return cleaned || message
}

/**
 * Read the structured `data` the library preserved verbatim from a Convex
 * application error. Never scans message text for embedded JSON — the library
 * owns transport/server/unknown classification and hands us `data` directly.
 */
function readGinkoErrorData(data: unknown): JsonRecord | null {
  if (typeof data === 'string') {
    try {
      return readGinkoErrorData(JSON.parse(data))
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as JsonRecord
}

/**
 * Refine a Ginko product error code into an MCP category. Returns `null` when
 * the code carries no product signal, so classification falls back to the
 * library's structural `kind`.
 */
function categoryFromNormalizedKind(kind: ConvexCallErrorKind): McpErrorCategory {
  switch (kind) {
    case 'authentication':
      return 'auth'
    case 'transport':
      return 'network'
    case 'server':
      return 'server'
    default:
      return 'unknown'
  }
}

export function fail(
  message: string,
  details?: unknown,
  options: {
    category?: McpErrorCategory
    code?: string
    suggestedAction?: string
  } = {},
): McpToolCallbackResult {
  const cleaned = cleanErrorMessage(message)
  return {
    content: [{ type: 'text', text: cleaned }],
    isError: true,
    structuredContent: {
      ok: false,
      error: {
        category: options.category ?? 'validation',
        ...(options.code ? { code: options.code } : {}),
        message: cleaned,
        retryable: ['network', 'server', 'rate_limit', 'conflict'].includes(
          options.category ?? 'validation',
        ),
        ...(details === undefined ? {} : { details: redactMcpResponse(details) }),
        ...(options.suggestedAction ? { suggestedAction: options.suggestedAction } : {}),
      },
    },
  }
}

export function failFromError(error: unknown, fallback: string): McpToolCallbackResult {
  if (error instanceof AgentToolError) {
    return fail(error.message, error.details, {
      category: error.category,
      code: error.code,
      suggestedAction: error.suggestedAction,
    })
  }

  // The library owns transport/server/unknown classification and preserves the
  // Convex application `data` verbatim; we refine category from that structured
  // data, never from re-parsed message text.
  const normalized = normalizeConvexError(error)
  const data = readGinkoErrorData(normalized.data)
  const code = typeof data?.code === 'string' ? data.code : (normalized.code ?? null)
  const message =
    (typeof data?.message === 'string' ? data.message : null) ?? normalized.message ?? fallback
  const details =
    data?.details && typeof data.details === 'object' && !Array.isArray(data.details)
      ? (data.details as JsonRecord)
      : undefined
  const suggestedAction =
    details && typeof details.suggestedAction === 'string' ? details.suggestedAction : undefined
  const category =
    classifyGinkoError(data, { code: normalized.code, status: normalized.status }) ??
    categoryFromNormalizedKind(normalized.kind)

  return fail(message, details, {
    category,
    ...(code ? { code } : {}),
    ...(suggestedAction ? { suggestedAction } : {}),
  })
}

export async function loadAgentContext(
  event: H3Event,
  capability?: keyof AgentMcpContext['capabilities'],
) {
  const context = await getMcpToolContext(event)
  if (capability && context.capabilities[capability] !== true) {
    throwAgentToolError(
      'MCP_CAPABILITY_REQUIRED',
      `Caller does not have the ${String(capability)} capability.`,
      { category: 'auth', details: { capability: String(capability) } },
    )
  }
  return context
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...(value as JsonRecord) } as JsonRecord)
    : {}
}
