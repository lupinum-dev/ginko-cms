import { cmsUserCaller, type CmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { convexTest, type TestConvex } from 'convex-test'
/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import schema from '#component/schema'
import { modules } from '#component/test.setup'

export const api = anyApi
type CmsOperationRef = {
  id: string
  executeRef: FunctionReference<'mutation'>
  previewRef?: FunctionReference<'mutation'>
}

const publishEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.publish-entry',
  executeRef: api.entries.publish.publishEntryOperationExecute,
  previewRef: api.entries.publish.previewPublishEntryOperation,
}
const unpublishEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.unpublish-entry',
  executeRef: api.entries.publish.unpublishEntryOperationExecute,
  previewRef: api.entries.publish.previewUnpublishEntryOperation,
}
const archiveEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.archive-entry',
  executeRef: api.entries.publish.archiveEntryOperationExecute,
  previewRef: api.entries.publish.previewArchiveEntryOperation,
}
const rollbackVersionOperation: CmsOperationRef = {
  id: 'ginko-cms.rollback-version',
  executeRef: api.entries.publish.rollbackVersionOperationExecute,
  previewRef: api.entries.publish.previewRollbackVersionOperation,
}
const revertDraftToPublishedOperation: CmsOperationRef = {
  id: 'ginko-cms.revert-draft-to-published',
  executeRef: api.entries.draft.revertDraftToPublishedOperationExecute,
  previewRef: api.entries.draft.previewRevertDraftToPublishedOperation,
}

function createCmsCallerClient(
  ctx: TestConvex<typeof schema>,
  caller: CmsUserCaller | { kind: 'mcp'; apiKeyId: string; ownerUserId: string },
) {
  const identity = {
    subject: caller.kind === 'user' ? caller.userId : caller.ownerUserId,
    ginkoCredentialKind: caller.kind === 'mcp' ? 'mcp-api-key' : 'user-session',
    ...(caller.kind === 'mcp' ? { sessionId: caller.apiKeyId } : { sessionId: 'test-session' }),
  }
  const authed = () => ctx.withIdentity(identity)
  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      return await authed().query(fn, ...args)
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      return await authed().mutation(fn, ...args)
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      return await authed().action(fn, ...args)
    },
    operation: <TOperation extends CmsOperationRef>(operation: TOperation) =>
      createOperationClient(authed(), operation),
    createEntry: async (args: Record<string, unknown>): Promise<string> =>
      (await authed().mutation(api.entries.tree.createEntry, args as never)) as string,
    saveEntryDraft: async (args: Record<string, unknown>): Promise<DraftSaveResult> =>
      (await authed().mutation(api.entries.draft.saveEntryDraft, args as never)) as DraftSaveResult,
    moveAsset: async (args: Record<string, unknown>): Promise<null> =>
      (await authed().mutation(api.assets.moveAsset, args as never)) as null,
  }
}

function createOperationClient(
  ctx: ReturnType<TestConvex<typeof schema>['withIdentity']>,
  operation: CmsOperationRef,
) {
  return {
    preview: async (args: Record<string, unknown>) => {
      if (!operation.previewRef) throw new Error(`Operation ${operation.id} has no preview ref.`)
      return await ctx.mutation(operation.previewRef, args as never)
    },
    execute: async (
      args: Record<string, unknown>,
      options: { confirmation?: { token?: string } | null } = {},
    ) => {
      const executeArgs = options.confirmation?.token
        ? { ...args, _confirmationToken: options.confirmation.token }
        : args
      return await ctx.mutation(operation.executeRef, executeArgs as never)
    },
  }
}

export function createCtx() {
  const ctx = convexTest({ schema, modules })
  ctx.registerComponent('ginkoCms', schema as never, modules as never)
  return Object.assign(ctx, {
    raw: ctx,
    seed: async (table: string, value: Record<string, unknown>) =>
      await ctx.run(
        async (mutationCtx) =>
          await mutationCtx.db.insert(
            table as never,
            (table === 'assets'
              ? {
                  sha256: '0'.repeat(64),
                  frames: 1,
                  ...value,
                  width: value.width ?? 1,
                  height: value.height ?? 1,
                }
              : value) as never,
          ),
      ),
    readAll: async (table: string) =>
      await ctx.run(async (mutationCtx) => await mutationCtx.db.query(table as never).collect()),
    asCmsUser: (userId: string) => createCmsCallerClient(ctx, cmsUserCaller(userId)),
    asMcpApiKey: (apiKeyId: string, ownerUserId: string) =>
      createCmsCallerClient(ctx, { kind: 'mcp', apiKeyId, ownerUserId }),
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
  let preview: { allowed?: boolean; confirmation?: { token: string; expiresAt: number } }
  try {
    preview = (await appIdentity.mutation(input.preview, input.args as never)) as {
      allowed?: boolean
      confirmation?: { token: string; expiresAt: number }
    }
  } catch (cause) {
    throw new Error(`Preview for ${input.operationId} failed.`, { cause })
  }
  const token =
    preview.allowed !== false && preview.confirmation && preview.confirmation.expiresAt > Date.now()
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
  input: {
    userId: string
    role: 'owner' | 'publisher' | 'editor' | 'viewer'
    displayName?: string
  },
) {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId: input.userId,
      role: input.role,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      createdAt: now,
      updatedAt: now,
      updatedBy: input.userId,
    } as never,
  )
}

export async function seedSettings(ctx: TestCtx) {
  await installTestContract(ctx, ['en'])
}

export async function seedMultiLocaleSettings(ctx: TestCtx) {
  await installTestContract(ctx, ['en', 'de'])
}

export async function installTestContract(ctx: TestCtx, locales: string[]) {
  const route = (path: string, translatedPath: string) =>
    Object.fromEntries(locales.map((locale) => [locale, locale === 'de' ? translatedPath : path]))
  const contract = buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          i18n: true,
          route: route('/posts', '/beitraege'),
          cms: {
            type: 'flat',
            fields: {
              featured: { type: 'toggle', localized: false },
              hero: { type: 'image', localized: false },
              author: {
                type: 'relation',
                localized: false,
                relation: { collectionId: 'authors' },
              },
            },
          },
        },
        docs: {
          type: 'page',
          source: 'content/docs/**/*.md',
          i18n: true,
          route: route('/docs', '/dokumentation'),
          cms: { type: 'tree', settings: { maxDepth: 5 } },
        },
        authors: {
          type: 'data',
          source: 'content/authors/**/*.json',
          i18n: true,
          cms: {
            type: 'flat',
            route: { mode: 'none', pathPrefix: '' },
            fields: { name: { type: 'text', localized: true, required: true } },
          },
        },
      },
    },
    {
      defaultLocale: 'en',
      locales,
      localeFallbacks: Object.fromEntries(
        locales.map((locale) => [locale, locale === 'en' ? [] : ['en']]),
      ),
    },
  )
  const contentHash = await hashCanonicalJson(contract)
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  return { contract, contentHash }
}
