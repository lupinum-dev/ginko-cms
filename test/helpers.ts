import {
  cmsMcpCaller,
  cmsUserCaller,
  type CmsMcpCaller,
  type CmsUserCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import { createIdentityForwardingEnvelopeArgs } from '@lupinum/trellis/backend'
/// <reference types="vite/client" />
import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import schema from '#component/schema'
import { modules } from '#component/test.setup'

export const api = anyApi
const TRUSTED_FORWARDING_KEY = 'test-ginko-cms-component-forwarding-key'
process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY
process.env.CONVEX_IDENTITY_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY
const functionNameSymbol = Symbol.for('functionName')

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
  raw: ReturnType<typeof createTestContext<typeof schema>>['raw'],
  caller: CmsUserCaller | CmsMcpCaller,
) {
  function withCmsCaller<TKind extends 'query' | 'mutation' | 'action'>(
    kind: TKind,
    fn: FunctionReference<TKind>,
    args: Record<string, unknown> | undefined,
  ) {
    const appArgs = { ...(args ?? {}) }
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
    return createIdentityForwardingEnvelopeArgs({
      args: appArgs,
      caller,
      transport: 'server',
      operation: kind,
      purpose,
      functionRef,
      key: TRUSTED_FORWARDING_KEY,
      keyId: 'default',
      ...(replayMode ? { replayMode } : {}),
      ttlMs: purpose === 'operation-execute' ? 10_000 : kind === 'query' ? 60_000 : 30_000,
    })
  }

  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const query = raw.query as unknown as (
        ref: Query,
        args?: OptionalRestArgs<Query>[0],
      ) => Promise<FunctionReturnType<Query>>
      return await query(
        fn,
        withCmsCaller(
          'query',
          fn,
          args[0] as Record<string, unknown> | undefined,
        ) as OptionalRestArgs<Query>[0],
      )
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const mutation = raw.mutation as unknown as (
        ref: Mutation,
        args?: OptionalRestArgs<Mutation>[0],
      ) => Promise<FunctionReturnType<Mutation>>
      return await mutation(
        fn,
        withCmsCaller(
          'mutation',
          fn,
          args[0] as Record<string, unknown> | undefined,
        ) as OptionalRestArgs<Mutation>[0],
      )
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const action = raw.action as unknown as (
        ref: Action,
        args?: OptionalRestArgs<Action>[0],
      ) => Promise<FunctionReturnType<Action>>
      return await action(
        fn,
        withCmsCaller(
          'action',
          fn,
          args[0] as Record<string, unknown> | undefined,
        ) as OptionalRestArgs<Action>[0],
      )
    },
  }
}

export function createCtx() {
  const ctx = createTestContext({ schema, modules, identityForwardingKey: TRUSTED_FORWARDING_KEY })
  return Object.assign(ctx, {
    asCmsUser: (userId: string) => createCmsCallerClient(ctx.raw, cmsUserCaller(userId)),
    asMcpKey: (mcpKeyId: string) => createCmsCallerClient(ctx.raw, cmsMcpCaller(mcpKeyId)),
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
