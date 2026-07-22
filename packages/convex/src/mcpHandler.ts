import { createConvexMcpHandler, runMcpTool, type McpAccessVerifier } from '@better-convex/mcp'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const readScope = 'readCms'
const writeScope = 'editEntries'
const jsonRecord = z.record(z.string(), z.json())
const nodeKind = z.enum(['page', 'folder', 'group', 'section'])

export type GinkoMcpCredentialAccess = {
  apiKeyId: string
  scopes: string[]
  expiresAt: number | null
}

export type GinkoMcpOperations = {
  resolveCredential(secretHash: string): Promise<GinkoMcpCredentialAccess | null>
  getEntry(args: { apiKeyId: string; id: string; locale?: string }): Promise<unknown>
  saveEntryDraft(args: {
    apiKeyId: string
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
}

async function hashCredential(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
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

export function createGinkoMcpHandler(options: {
  issuer: URL
  operations: GinkoMcpOperations
  resource: URL
}) {
  const { issuer, operations, resource } = options
  const verifier: McpAccessVerifier = {
    async verifyAccessToken(token, expectedResource) {
      if (expectedResource.href !== resource.href) throw new Error('Unexpected MCP resource.')
      const access = await operations.resolveCredential(await hashCredential(token))
      if (!access) throw new Error('Invalid MCP credential.')
      const now = Math.floor(Date.now() / 1_000)
      return {
        access: {
          issuer: issuer.href,
          subject: access.apiKeyId,
          clientId: 'ginko-preconfigured-client',
          resource: resource.href,
          scopes: access.scopes,
        },
        expiresAt:
          access.expiresAt === null
            ? now + 60
            : Math.min(Math.floor(access.expiresAt / 1_000), now + 60),
      }
    },
  }

  return createConvexMcpHandler({
    resource,
    verifier,
    authorization: { mode: 'preconfigured-bearer', issuer: issuer.href },
    createServer(_context, access) {
      const server = new McpServer({ name: 'ginko-cms', version: '0.1.0' })
      server.registerTool(
        'get_entry',
        {
          description: 'Load one CMS entry.',
          inputSchema: z.object({ entryId: z.string(), locale: z.string().optional() }),
          outputSchema: z.object({ entry: z.unknown().nullable() }),
        },
        async ({ entryId, locale }) => {
          if (!access.scopes.includes(readScope)) return requiredScopeResult(readScope)
          return await runMcpTool(
            async () => {
              const entry = await operations.getEntry({
                apiKeyId: access.subject,
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
            },
            {
              operation: 'query',
              functionName: 'ginkoCms/mcpPilotOperations:getEntry',
              toolName: 'get_entry',
            },
          )
        },
      )
      server.registerTool(
        'save_entry_draft',
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
          return await runMcpTool(
            async () => {
              try {
                const result = await operations.saveEntryDraft({
                  apiKeyId: access.subject,
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
            },
            {
              operation: 'mutation',
              functionName: 'ginkoCms/mcpPilotOperations:saveEntryDraft',
              toolName: 'save_entry_draft',
            },
          )
        },
      )
      return server
    },
  })
}
