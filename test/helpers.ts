import {
  cmsMcpCaller,
  cmsUserCaller,
  type CmsMcpCaller,
  type CmsUserCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
/// <reference types="vite/client" />
import { createTestContext } from '@lupinum/trellis/testing'
import type { TestCallerOptions } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import schema from '#component/schema'
import { modules } from '#component/test.setup'

export const api = anyApi
const TRUSTED_FORWARDING_KEY = 'test-ginko-cms-component-forwarding-key'
process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY
process.env.CONVEX_IDENTITY_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY
const functionNameSymbol = Symbol.for('functionName')
const destructiveExecuteFunctionRefs = new Set([
  'assets:deleteAssetOperationExecute',
  'assets:purgeAsset',
  'backup:deleteBackupArtifactOperationExecute',
  'entries/draft:revertDraftToPublishedOperationExecute',
  'entries/publish:archiveEntryOperationExecute',
  'entries/publish:publishEntryOperationExecute',
  'entries/publish:rollbackVersionOperationExecute',
  'entries/publish:unpublishEntryOperationExecute',
  'entries/tree:deleteEntryOperationExecute',
  'members:removeMemberOperationExecute',
  'revalidation:retryRevalidationJobOperationExecute',
  'siteData:deleteSiteDataBlockOperationExecute',
])
const destructiveTransportExecuteFunctionRefs: Record<string, string> = {
  'assets:deleteAssetTransportExecute': 'assets:deleteAssetOperationExecute',
  'entries/draft:revertDraftToPublishedTransportExecute':
    'entries/draft:revertDraftToPublishedOperationExecute',
  'entries/publish:archiveEntryTransportExecute': 'entries/publish:archiveEntryOperationExecute',
  'entries/publish:publishEntryTransportExecute': 'entries/publish:publishEntryOperationExecute',
  'entries/publish:rollbackVersionTransportExecute':
    'entries/publish:rollbackVersionOperationExecute',
  'entries/publish:unpublishEntryTransportExecute':
    'entries/publish:unpublishEntryOperationExecute',
  'entries/tree:deleteEntryTransportExecute': 'entries/tree:deleteEntryOperationExecute',
  'siteData:deleteSiteDataBlockTransportExecute': 'siteData:deleteSiteDataBlockOperationExecute',
}
const handlerIdByFunctionRef: Record<string, string> = {
  'assets:moveAsset': 'ginko-cms.move-asset',
  'editor:createEntry': 'ginko-cms.create-entry',
  'editor:saveEntryDraft': 'ginko-cms.save-entry-draft',
  'entries/draft:saveEntryDraft': 'ginko-cms.save-entry-draft',
  'entries/publish:unarchiveEntry': 'ginko-cms.unarchive-entry',
  'entries/tree:createEntry': 'ginko-cms.create-entry',
}

function toHandlerId(functionRef: string): string {
  const executeFunctionRef = destructiveTransportExecuteFunctionRefs[functionRef]
  if (executeFunctionRef) return executeFunctionRef
  if (destructiveExecuteFunctionRefs.has(functionRef)) return functionRef
  return handlerIdByFunctionRef[functionRef] ?? functionRef
}

function getFunctionRef(ref: unknown): string {
  if (typeof ref === 'string') return ref
  if (typeof ref === 'object' && ref !== null) {
    const record = ref as Record<string | symbol, unknown>
    if (typeof record[functionNameSymbol] === 'string') return record[functionNameSymbol]
    if (typeof record._path === 'string') return record._path
    if (typeof record.functionPath === 'string') return record.functionPath
  }

  throw new Error('Ginko CMS test helper requires an exact function ref.')
}

function createCmsCallerClient(
  ctx: ReturnType<typeof createTestContext<typeof schema>>,
  caller: CmsUserCaller | CmsMcpCaller,
) {
  function cmsCallerOptions<TKind extends 'query' | 'mutation' | 'action'>(
    kind: TKind,
    fn: FunctionReference<TKind>,
  ): TestCallerOptions {
    const functionRef = getFunctionRef(fn)
    const purpose =
      kind === 'mutation' && functionRef.endsWith('TransportExecute') ? 'operation-execute' : kind
    const replayMode =
      purpose === 'operation-execute'
        ? 'operation-confirmation'
        : kind === 'mutation'
          ? 'jti-redemption'
          : kind === 'action'
            ? 'domain-idempotency'
            : undefined

    return {
      purpose,
      targetFunctionRef: toHandlerId(functionRef),
      keyId: 'default',
      ...(replayMode ? { replayMode } : {}),
    }
  }

  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const client = ctx.asCaller(caller, cmsCallerOptions('query', fn))
      return await client.query(fn, ...args)
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const client = ctx.asCaller(caller, cmsCallerOptions('mutation', fn))
      return await client.mutation(fn, ...args)
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const client = ctx.asCaller(caller, cmsCallerOptions('action', fn))
      return await client.action(fn, ...args)
    },
  }
}

export function createCtx() {
  const ctx = createTestContext({ schema, modules, identityForwardingKey: TRUSTED_FORWARDING_KEY })
  return Object.assign(ctx, {
    asCmsUser: (userId: string) => createCmsCallerClient(ctx, cmsUserCaller(userId)),
    asMcpKey: (mcpKeyId: string) => createCmsCallerClient(ctx, cmsMcpCaller(mcpKeyId)),
  })
}

export type TestCtx = ReturnType<typeof createCtx>
type CmsCallerClient = ReturnType<typeof createCmsCallerClient>

export async function currentDraftVersion(
  appIdentity: CmsCallerClient,
  entryId: string,
): Promise<number> {
  const entry = (await appIdentity.query(api.editor.getEntry as FunctionReference<'query'>, {
    id: entryId,
  })) as { draftVersion?: unknown } | null
  if (!entry || typeof entry.draftVersion !== 'number') {
    throw new Error(`Entry ${entryId} has no current draftVersion.`)
  }
  return entry.draftVersion
}

export async function executeConfirmedOperation(
  appIdentity: ReturnType<typeof createCmsCallerClient>,
  input: {
    operationId: string
    execute: FunctionReference<'mutation'>
    preview: FunctionReference<'mutation'>
    args: Record<string, unknown>
    callerKey?: string
  },
) {
  const preview = (await appIdentity.mutation(input.preview, input.args as never)) as {
    confirmation?: { token: string; expiresAt: number }
  }
  const token =
    preview.confirmation && preview.confirmation.expiresAt > Date.now()
      ? preview.confirmation.token
      : null
  if (!token)
    throw new Error(`Preview for ${input.operationId} did not return a confirmation token.`)

  return await appIdentity.mutation(input.execute, {
    ...input.args,
    _confirmationToken: token,
  } as never)
}

export async function seedOwner(ctx: TestCtx, userId = 'owner-1') {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    } as never,
  )
}

export async function seedMember(
  ctx: TestCtx,
  input: { userId: string; role: 'owner' | 'publisher' | 'editor' | 'viewer' },
) {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId: input.userId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.userId,
    } as never,
  )
}

export async function seedSettings(
  ctx: TestCtx,
  options?: {
    webhooks?: Array<{
      id: string
      name: string
      url: string
      enabled: boolean
      events: Array<
        | 'entry.published'
        | 'entry.unpublished'
        | 'entry.deleted'
        | 'asset.created'
        | 'asset.deleted'
      >
      secretFingerprint: string | null
    }>
  },
) {
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales: [{ code: 'en', label: 'English', isDefault: true }],
      webhooks: options?.webhooks ?? [],
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
    } as never,
  )
}

export async function seedMultiLocaleSettings(ctx: TestCtx) {
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'de', label: 'Deutsch', isDefault: false },
      ],
      webhooks: [],
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
    } as never,
  )
}
