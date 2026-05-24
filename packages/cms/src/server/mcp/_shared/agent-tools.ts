import type { McpToolCallbackResult } from '@nuxtjs/mcp-toolkit/server'
import type { H3Event } from 'h3'

import { getMcpToolContext } from './project-tool-runtime'

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
    structuredContent: data as Record<string, unknown>,
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

function parseJsonObjectText(text: string): JsonRecord | null {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as JsonRecord
        }
      } catch {
        // Keep looking; Convex messages can contain non-JSON prefixes/suffixes.
      }
    }
  }
  return null
}

function categoryFromCode(code: string, message: string): McpErrorCategory {
  const token = `${code} ${message}`.toLowerCase()
  if (token.includes('unauth') || token.includes('forbidden')) return 'auth'
  if (token.includes('not_found') || token.includes('not found')) return 'not_found'
  if (token.includes('rate_limit') || token.includes('too many')) return 'rate_limit'
  if (
    token.includes('conflict') ||
    token.includes('version') ||
    token.includes('confirmation') ||
    token.includes('changed in another session')
  ) {
    return 'conflict'
  }
  if (token.includes('network') || token.includes('remote upload')) return 'network'
  if (
    token.includes('invalid') ||
    token.includes('required') ||
    token.includes('unsupported') ||
    token.includes('mime') ||
    token.includes('locale')
  ) {
    return 'validation'
  }
  return 'server'
}

function failFromStructuredMessage(message: string): McpToolCallbackResult | null {
  const parsed = parseJsonObjectText(message)
  const code = typeof parsed?.code === 'string' ? parsed.code : null
  const parsedMessage = typeof parsed?.message === 'string' ? parsed.message : null
  if (!code || !parsedMessage) return null

  const parsedRecord = parsed as JsonRecord
  const details =
    parsedRecord.details && typeof parsedRecord.details === 'object'
      ? parsedRecord.details
      : undefined
  const suggestedAction =
    details &&
    !Array.isArray(details) &&
    typeof (details as Record<string, unknown>).suggestedAction === 'string'
      ? String((details as Record<string, unknown>).suggestedAction)
      : undefined

  return fail(parsedMessage, details, {
    category: categoryFromCode(code, parsedMessage),
    code,
    ...(suggestedAction ? { suggestedAction } : {}),
  })
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
        ...(details === undefined ? {} : { details }),
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
  if (error instanceof Error) {
    return failFromStructuredMessage(error.message) ?? fail(error.message)
  }
  return fail(fallback)
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
