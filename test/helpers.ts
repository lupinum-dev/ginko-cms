import {
  cmsMcpCaller,
  cmsUserCaller,
  type CmsMcpCaller,
  type CmsUserCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { OperationHandle } from '@lupinum/trellis/backend'
/// <reference types="vite/client" />
import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import schema from '#component/schema'
import { modules } from '#component/test.setup'

import { operations } from '../packages/convex/generated/operationHandles/testing'

export const api = anyApi
const createEntryOperation = operations.byId['ginko-cms.create-entry']
const saveEntryDraftOperation = operations.byId['ginko-cms.save-entry-draft']
const moveAssetOperation = operations.byId['ginko-cms.move-asset']
const publishEntryOperation = operations.byId['ginko-cms.publish-entry']
const unpublishEntryOperation = operations.byId['ginko-cms.unpublish-entry']
const archiveEntryOperation = operations.byId['ginko-cms.archive-entry']
const deleteEntryOperation = operations.byId['ginko-cms.delete-entry']
const rollbackVersionOperation = operations.byId['ginko-cms.rollback-version']
const revertDraftToPublishedOperation = operations.byId['ginko-cms.revert-draft-to-published']
const unarchiveEntryOperation = operations.byId['ginko-cms.unarchive-entry']
const TRUSTED_FORWARDING_KEY = 'test-ginko-cms-component-forwarding-key'
process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY
process.env.CONVEX_IDENTITY_FORWARDING_KEY ??= TRUSTED_FORWARDING_KEY

function createCmsCallerClient(
  ctx: ReturnType<typeof createTestContext<typeof schema>>,
  caller: CmsUserCaller | CmsMcpCaller,
) {
  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const client = ctx.asCaller(caller)
      return await client.query(fn, ...args)
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const client = ctx.asCaller(caller)
      return await client.mutation(fn, ...args)
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const client = ctx.asCaller(caller)
      return await client.action(fn, ...args)
    },
    operation: <TOperation extends OperationHandle>(operation: TOperation) =>
      ctx.asCaller(caller).operation(operation),
    createEntry: async (args: Record<string, unknown>): Promise<string> =>
      (await ctx.asCaller(caller).operation(createEntryOperation).execute(args)) as string,
    saveEntryDraft: async (args: Record<string, unknown>): Promise<DraftSaveResult> =>
      (await ctx
        .asCaller(caller)
        .operation(saveEntryDraftOperation)
        .execute(args)) as DraftSaveResult,
    moveAsset: async (args: Record<string, unknown>): Promise<null> =>
      (await ctx.asCaller(caller).operation(moveAssetOperation).execute(args)) as null,
    unarchiveEntry: async (args: Record<string, unknown>): Promise<null> =>
      (await ctx.asCaller(caller).operation(unarchiveEntryOperation).execute(args)) as null,
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
type DraftSaveResult = { draftVersion: number; dirtyLocales: string[] }

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

export async function publishEntryWithArgs(
  appIdentity: CmsCallerClient,
  args: { entryId: string; expectedVersion: number; locales: string[] },
) {
  const operation = appIdentity.operation(publishEntryOperation)
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

export async function previewPublishEntryWithArgs(
  appIdentity: CmsCallerClient,
  args: { entryId: string; expectedVersion: number; locales: string[] },
) {
  return await appIdentity.operation(publishEntryOperation).preview(args)
}

export async function publishEntry(
  appIdentity: CmsCallerClient,
  entryId: string,
  locales: string[] = ['en'],
) {
  return await publishEntryWithArgs(appIdentity, {
    entryId,
    expectedVersion: await currentDraftVersion(appIdentity, entryId),
    locales,
  })
}

export async function previewUnpublishEntry(appIdentity: CmsCallerClient, entryId: string) {
  return await appIdentity.operation(unpublishEntryOperation).preview({ entryId })
}

export async function unpublishEntry(appIdentity: CmsCallerClient, entryId: string) {
  const operation = appIdentity.operation(unpublishEntryOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

export async function previewArchiveEntry(appIdentity: CmsCallerClient, entryId: string) {
  return await appIdentity.operation(archiveEntryOperation).preview({ entryId })
}

export async function archiveEntry(appIdentity: CmsCallerClient, entryId: string) {
  const operation = appIdentity.operation(archiveEntryOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

export async function previewDeleteEntry(
  appIdentity: CmsCallerClient,
  args: { entryId: string; exportArtifactId?: string; assetMode?: 'delete' | 'moveToCollection' },
) {
  return await appIdentity.operation(deleteEntryOperation).preview(args)
}

export async function deleteEntry(
  appIdentity: CmsCallerClient,
  args: { entryId: string; exportArtifactId: string; assetMode?: 'delete' | 'moveToCollection' },
) {
  const operation = appIdentity.operation(deleteEntryOperation)
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

export async function rollbackVersion(
  appIdentity: CmsCallerClient,
  args: { entryId: string; versionId: string; publish: boolean },
) {
  const operation = appIdentity.operation(rollbackVersionOperation)
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

export async function revertDraftToPublished(appIdentity: CmsCallerClient, entryId: string) {
  const operation = appIdentity.operation(revertDraftToPublishedOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
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
