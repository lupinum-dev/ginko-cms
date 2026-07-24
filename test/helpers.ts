import {
  cmsMcpCaller,
  cmsUserCaller,
  type CmsMcpCaller,
  type CmsUserCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { convexTest, type TestConvex } from 'convex-test'
/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import { assetDiscoveryFields } from '#component/assets/scope'
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
const permanentlyDeleteEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.permanently-delete-entry',
  executeRef: api.entries.permanentDelete.permanentlyDeleteEntryOperationExecute,
  previewRef: api.entries.permanentDelete.previewPermanentlyDeleteEntryOperation,
}
const rollbackVersionOperation: CmsOperationRef = {
  id: 'ginko-cms.rollback-version',
  executeRef: api.entries.publicationHistory.rollbackVersionOperationExecute,
  previewRef: api.entries.publicationHistory.previewRollbackVersionOperation,
}
const revertDraftToPublishedOperation: CmsOperationRef = {
  id: 'ginko-cms.revert-draft-to-published',
  executeRef: api.entries.draft.revertDraftToPublishedOperationExecute,
  previewRef: api.entries.draft.previewRevertDraftToPublishedOperation,
}
const reorderEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.reorder-entry',
  executeRef: api.entries.tree.reorderEntryOperationExecute,
  previewRef: api.entries.tree.previewReorderEntryOperation,
}
const reparentEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.reparent-entry',
  executeRef: api.entries.tree.reparentEntryOperationExecute,
  previewRef: api.entries.tree.previewReparentEntryOperation,
}

async function bindExpectedContractArgs(
  ctx: TestConvex<typeof schema>,
  args: Record<string, unknown>,
) {
  const installed = await ctx.run(
    async (inner) =>
      await inner.db
        .query('cmsContract')
        .withIndex('by_key', (query) => query.eq('key', 'active'))
        .first(),
  )
  return {
    ...args,
    _expectedContentHash: installed?.contentHash ?? '0'.repeat(64),
    _expectedPresentationHash: installed?.presentationHash ?? '0'.repeat(64),
  }
}

function createCmsCallerClient(
  ctx: TestConvex<typeof schema>,
  caller: CmsUserCaller | CmsMcpCaller,
) {
  const identity =
    caller.kind === 'user'
      ? {
          subject: caller.userId,
          token_use: 'convex-session',
          ...(caller.name ? { name: caller.name } : {}),
          ...(caller.email ? { email: caller.email } : {}),
          ...(typeof caller.emailVerified === 'boolean'
            ? { emailVerified: caller.emailVerified }
            : {}),
        }
      : null
  const authed = () => (identity ? ctx.withIdentity(identity) : ctx)
  const bindCaller = (input: Record<string, unknown>) =>
    caller.kind === 'mcp' ? { ...input, _trustedCaller: caller } : input
  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const [input = {}] = args as unknown as [Record<string, unknown>?]
      return await authed().query(fn, bindCaller(input) as never)
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const [input = {}] = args as unknown as [Record<string, unknown>?]
      return await authed().mutation(
        fn,
        bindCaller(await bindExpectedContractArgs(ctx, input)) as never,
      )
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const [input = {}] = args as unknown as [Record<string, unknown>?]
      return await authed().action(
        fn,
        bindCaller(await bindExpectedContractArgs(ctx, input)) as never,
      )
    },
    operation: <TOperation extends CmsOperationRef>(operation: TOperation) =>
      createOperationClient(ctx, authed(), operation),
    createEntry: async (args: Record<string, unknown>): Promise<string> =>
      (await authed().mutation(
        api.entries.tree.createEntry,
        (await bindExpectedContractArgs(ctx, args)) as never,
      )) as string,
    saveEntryDraft: async (args: Record<string, unknown>): Promise<DraftSaveResult> =>
      (await authed().mutation(
        api.entries.draft.saveEntryDraft,
        (await bindExpectedContractArgs(ctx, args)) as never,
      )) as DraftSaveResult,
    moveAsset: async (args: Record<string, unknown>): Promise<null> =>
      (await authed().mutation(
        api.assets.moveAsset,
        (await bindExpectedContractArgs(ctx, args)) as never,
      )) as null,
  }
}

function createOperationClient(
  rootCtx: TestConvex<typeof schema>,
  ctx: ReturnType<TestConvex<typeof schema>['withIdentity']>,
  operation: CmsOperationRef,
) {
  return {
    preview: async (args: Record<string, unknown>) => {
      if (!operation.previewRef) throw new Error(`Operation ${operation.id} has no preview ref.`)
      return await ctx.mutation(
        operation.previewRef,
        (await bindExpectedContractArgs(rootCtx, args)) as never,
      )
    },
    execute: async (
      args: Record<string, unknown>,
      options: { confirmation?: { token?: string } | null } = {},
    ) => {
      const executeArgs = options.confirmation?.token
        ? { ...args, _confirmationToken: options.confirmation.token }
        : args
      return await ctx.mutation(
        operation.executeRef,
        (await bindExpectedContractArgs(rootCtx, executeArgs)) as never,
      )
    },
  }
}

export function createCtx(
  options: {
    transactionLimits?: boolean | { bytesRead?: number; documentsRead?: number }
  } = {},
) {
  const ctx = convexTest({
    schema,
    modules,
    ...(options.transactionLimits === undefined
      ? {}
      : { transactionLimits: options.transactionLimits }),
  })
  ctx.registerComponent('ginkoCms', schema as never, modules as never)
  const seedValue = (table: string, value: Record<string, unknown>) => {
    if (table === 'mcpOAuthDelegations') {
      return {
        delegationId: `mcpd_${String(value.oauthClientId ?? 'test')}`,
        ...value,
      }
    }
    if (table !== 'assets') return value
    const filename = String(value.filename)
    const mimeType = String(value.mimeType)
    const createdAt = Number(value.createdAt)
    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : null
    const deletedAt = typeof value.deletedAt === 'number' ? value.deletedAt : null
    const tags = Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    return {
      sha256: '0'.repeat(64),
      frames: 1,
      ...value,
      width: value.width ?? 1,
      height: value.height ?? 1,
      ...assetDiscoveryFields({ filename, mimeType, tags, createdAt, updatedAt, deletedAt }),
    }
  }
  return Object.assign(ctx, {
    raw: ctx,
    seed: async (table: string, value: Record<string, unknown>) =>
      await ctx.run(
        async (mutationCtx) =>
          await mutationCtx.db.insert(table as never, seedValue(table, value) as never),
      ),
    readAll: async (table: string) =>
      await ctx.run(async (mutationCtx) => await mutationCtx.db.query(table as never).collect()),
    asCmsUser: (
      userId: string,
      profile?: { name?: string; email?: string; emailVerified?: boolean },
    ) => createCmsCallerClient(ctx, cmsUserCaller(userId, profile)),
    asMcpOAuth: (
      oauthClientId: string,
      userId: string,
      scopes: readonly string[] = mcpDelegatedScopeKeys,
    ) =>
      createCmsCallerClient(
        ctx,
        cmsMcpCaller({
          issuer: 'https://ginko.example.test/api/auth',
          userId,
          clientId: oauthClientId,
          scopes,
        }),
      ),
  })
}

export type TestCtx = ReturnType<typeof createCtx>
type CmsCallerClient = ReturnType<typeof createCmsCallerClient>

export async function seedMcpDelegation(
  ctx: TestCtx,
  args: {
    oauthClientId: string
    ownerUserId: string
    scopes: string[]
    status?: 'active' | 'revoked'
    expiresAt?: number | null
  },
) {
  const now = Date.now()
  await ctx.seed('mcpOAuthDelegations', {
    delegationId: `mcpd_${args.oauthClientId}`,
    oauthClientId: args.oauthClientId,
    ownerUserId: args.ownerUserId,
    scopes: args.scopes,
    status: args.status ?? 'active',
    expiresAt: args.expiresAt ?? null,
    createdBy: 'test',
    createdAt: now,
    updatedBy: 'test',
    updatedAt: now,
    revokedAt: args.status === 'revoked' ? now : null,
  })
}

export async function readTestContractWriteToken(ctx: TestCtx) {
  const [installed] = await ctx.readAll('cmsContract')
  if (!installed) throw new Error('Expected an installed CMS contract.')
  return {
    contentHash: installed.contentHash,
    presentationHash: installed.presentationHash,
    generation: installed.writeGeneration,
  }
}
type DraftSaveResult = { draftVersion: number; dirtyLocales: string[] }
type PublishResult = DraftSaveResult & { versionId: string }
type TreeMoveResult = {
  draftVersion: number
  parentEntryId: string | null
  orderRank: string
}

function operationValue<T>(result: unknown): T {
  if (!result || typeof result !== 'object' || !('status' in result)) {
    throw new Error('Operation returned an invalid result.')
  }
  if (result.status !== 'applied') {
    const message = 'message' in result ? String(result.message) : 'Operation was not applied.'
    throw new Error(message)
  }
  if (!('value' in result)) throw new Error('Applied operation returned no value.')
  return result.value as T
}

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
): Promise<PublishResult> {
  const operation = appIdentity.operation(publishEntryOperation)
  const preview = await operation.preview(args)
  if (!preview.confirmation) {
    throw new Error(`Publish preview was blocked: ${JSON.stringify(preview.blockers)}`)
  }
  return operationValue<PublishResult>(
    await operation.execute(args, { confirmation: preview.confirmation }),
  )
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

export async function previewUnpublishEntry(
  appIdentity: CmsCallerClient,
  entryId: string,
  locales: string[] = ['en'],
) {
  return await appIdentity.operation(unpublishEntryOperation).preview({ entryId, locales })
}

export async function unpublishEntry(
  appIdentity: CmsCallerClient,
  entryId: string,
  locales: string[] = ['en'],
) {
  const operation = appIdentity.operation(unpublishEntryOperation)
  const args = { entryId, locales }
  const preview = await operation.preview(args)
  return operationValue<null>(await operation.execute(args, { confirmation: preview.confirmation }))
}

export async function previewArchiveEntry(appIdentity: CmsCallerClient, entryId: string) {
  return await appIdentity.operation(archiveEntryOperation).preview({ entryId })
}

export async function archiveEntry(appIdentity: CmsCallerClient, entryId: string) {
  const operation = appIdentity.operation(archiveEntryOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return operationValue<null>(await operation.execute(args, { confirmation: preview.confirmation }))
}

export async function previewPermanentlyDeleteEntry(
  appIdentity: CmsCallerClient,
  args: { entryId: string; confirmationPhrase: string },
) {
  return await appIdentity.operation(permanentlyDeleteEntryOperation).preview(args)
}

export async function permanentlyDeleteEntry(
  appIdentity: CmsCallerClient,
  args: { entryId: string; confirmationPhrase: string },
) {
  const operation = appIdentity.operation(permanentlyDeleteEntryOperation)
  const preview = await operation.preview(args)
  return operationValue<{
    entryId: string
    collection: string
    stableId: string
    deleted: boolean
    alreadyDeleted: boolean
    activityRecordsRetainedAtDeletion: number
    standardActivityRecordsRetainedAtDeletion: number
    legalActivityRecordsRetained: number
  }>(await operation.execute(args, { confirmation: preview.confirmation }))
}

export async function rollbackVersion(
  appIdentity: CmsCallerClient,
  args: { entryId: string; versionId: string; publish: boolean },
) {
  const operation = appIdentity.operation(rollbackVersionOperation)
  const preview = await operation.preview(args)
  return operationValue<{ versionId: string }>(
    await operation.execute(args, { confirmation: preview.confirmation }),
  )
}

export async function revertDraftToPublished(appIdentity: CmsCallerClient, entryId: string) {
  const operation = appIdentity.operation(revertDraftToPublishedOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return operationValue<DraftSaveResult>(
    await operation.execute(args, { confirmation: preview.confirmation }),
  )
}

export type TreeMoveArgs = {
  entryId: string
  expectedDraftVersion: number
  parentEntryId?: string
  beforeEntryId?: string
  afterEntryId?: string
}

export async function previewReorderEntry(appIdentity: CmsCallerClient, args: TreeMoveArgs) {
  return await appIdentity.operation(reorderEntryOperation).preview(args)
}

export async function reorderEntry(
  appIdentity: CmsCallerClient,
  args: TreeMoveArgs,
): Promise<TreeMoveResult> {
  const operation = appIdentity.operation(reorderEntryOperation)
  const preview = await operation.preview(args)
  if (!preview.confirmation) {
    throw new Error(`Reorder preview was blocked: ${JSON.stringify(preview.blockers)}`)
  }
  return operationValue<TreeMoveResult>(
    await operation.execute(args, { confirmation: preview.confirmation }),
  )
}

export async function previewReparentEntry(appIdentity: CmsCallerClient, args: TreeMoveArgs) {
  return await appIdentity.operation(reparentEntryOperation).preview(args)
}

export async function reparentEntry(
  appIdentity: CmsCallerClient,
  args: TreeMoveArgs,
): Promise<TreeMoveResult> {
  const operation = appIdentity.operation(reparentEntryOperation)
  const preview = await operation.preview(args)
  if (!preview.confirmation) {
    throw new Error(`Reparent preview was blocked: ${JSON.stringify(preview.blockers)}`)
  }
  return operationValue<TreeMoveResult>(
    await operation.execute(args, { confirmation: preview.confirmation }),
  )
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
  let preview: {
    allowed?: boolean
    blockers?: Array<{ message?: string }>
    confirmation?: { token: string; expiresAt: number }
  }
  try {
    preview = (await appIdentity.mutation(input.preview, input.args as never)) as {
      allowed?: boolean
      blockers?: Array<{ message?: string }>
      confirmation?: { token: string; expiresAt: number }
    }
  } catch (cause) {
    throw new Error(`Preview for ${input.operationId} failed.`, { cause })
  }
  const token =
    preview.allowed !== false && preview.confirmation && preview.confirmation.expiresAt > Date.now()
      ? preview.confirmation.token
      : null
  if (!token) {
    throw new Error(
      preview.blockers?.[0]?.message ??
        `Preview for ${input.operationId} did not return a confirmation token.`,
    )
  }

  return operationValue(
    await appIdentity.mutation(input.execute, {
      ...input.args,
      _confirmationToken: token,
    } as never),
  )
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
    email?: string
  },
) {
  const now = Date.now()
  await ctx.seed(
    'members' as never,
    {
      userId: input.userId,
      role: input.role,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.email ? { email: input.email } : {}),
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
              title: { type: 'text', localized: true, required: true, searchable: true },
              description: { type: 'textarea', localized: true },
              internalNote: {
                type: 'text',
                localized: true,
                searchable: true,
              },
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
          cms: {
            type: 'tree',
            route: { slugMode: 'localized' },
            fields: {
              title: { type: 'text', localized: true, required: true, searchable: true },
            },
          },
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
  const presentation = {
    collections: {
      posts: { fields: { internalNote: { hidden: true } } },
    },
  }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  return { contract, contentHash }
}
