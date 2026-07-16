import {
  createSiteDataBlock as createSiteDataBlockArgs,
  deleteSiteDataBlock as deleteSiteDataBlockArgs,
  getSiteDataBlock as getSiteDataBlockArgs,
  saveSiteData as saveSiteDataArgs,
  updateSiteDataBlock as updateSiteDataBlockArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/siteData.js'
import {
  siteDataBlockValidator,
  siteDataListItemValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import { canManageSettings, canRead } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx } from './lib/types.js'
import { assertValidLocaleCode, assertValidSiteDataKey } from './lib/validation.js'
import {
  blockedPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from './operationHelpers.js'
import { scheduleRevalidationOutboxDelivery } from './revalidation.js'

type SiteDataDoc = Doc<'siteData'>

function isLocaleKey(value: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)
}

function localeDataMap(value: unknown): JsonMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as JsonMap).filter(([key]) => isLocaleKey(key)),
  ) as JsonMap
}

function assertJsonValue(value: unknown, path = 'data'): void {
  if (value === null) return

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return
  if (valueType === 'number') {
    if (Number.isFinite(value)) return
    throwCmsError('SITE_DATA_JSON_INVALID', 'Site data must be JSON-compatible.', { path })
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`))
    return
  }
  if (valueType === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throwCmsError('SITE_DATA_JSON_INVALID', 'Site data must be JSON-compatible.', { path })
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      assertJsonValue(item, `${path}.${key}`)
    }
    return
  }

  throwCmsError('SITE_DATA_JSON_INVALID', 'Site data must be JSON-compatible.', { path })
}

async function enqueuePublicSiteDataRevalidation(
  ctx: MutationCtx,
  args: { key: string; appIdentityId: string; now: number },
) {
  const idempotencyKey = `site-data.revalidate:${args.key}:${args.now}`
  const existing = await ctx.db
    .query('outboxEvents')
    .withIndex('by_idempotency_key', (q) => q.eq('idempotencyKey', idempotencyKey))
    .first()
  if (existing) return

  await ctx.db.insert('outboxEvents', {
    type: 'content.revalidate',
    status: 'pending',
    idempotencyKey,
    versionId: null,
    targetId: null,
    tags: ['site-data', `site-data:${args.key}`],
    paths: ['/'],
    payload: {
      reason: 'site-data',
      key: args.key,
      appIdentityId: args.appIdentityId,
    },
    attempts: 0,
    nextAttemptAt: args.now,
    lastError: null,
    lockedAt: null,
    lockExpiresAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  })
  await scheduleRevalidationOutboxDelivery(ctx)
}

async function revalidatePublicSiteDataIfNeeded(
  ctx: MutationCtx,
  row: SiteDataDoc,
  args: { appIdentityId: string; now: number },
) {
  if (row.visibility !== 'public') return
  await enqueuePublicSiteDataRevalidation(ctx, {
    key: row.key,
    appIdentityId: args.appIdentityId,
    now: args.now,
  })
}

export const listSiteData = callerQuery.protected({
  id: 'siteData:listSiteData',
  args: {},
  guard: canRead,
  returns: v.array(siteDataListItemValidator),
  handler: async (ctx) =>
    (await ctx.db.query('siteData').collect()).map((row: SiteDataDoc) => ({
      _id: toStringId(row._id),
      key: row.key,
      label: row.label ?? null,
      schemaType: row.schemaType ?? null,
      localized: row.localized,
      visibility: row.visibility ?? 'private',
      updatedBy: row.updatedBy ?? null,
      updatedAt: row.updatedAt,
    })),
})

export const getSiteDataBlock = callerQuery.protected({
  id: 'siteData:getSiteDataBlock',
  args: getSiteDataBlockArgs.args,
  guard: canRead,
  returns: siteDataBlockValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    if (!row) return null
    return {
      _id: toStringId(row._id),
      key: row.key,
      label: row.label ?? null,
      schemaType: row.schemaType ?? null,
      localized: row.localized,
      visibility: row.visibility ?? 'private',
      data: row.data,
      updatedBy: row.updatedBy ?? null,
      updatedAt: row.updatedAt,
    }
  },
})

export const createSiteDataBlock = callerMutation.protected({
  id: 'siteData:createSiteDataBlock',
  args: createSiteDataBlockArgs.args,
  guard: canManageSettings,
  returns: v.string(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    assertValidSiteDataKey(args.key)
    const existing = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    if (existing) {
      throwCmsError(
        'SITE_DATA_BLOCK_ALREADY_EXISTS',
        `Site data block "${args.key}" already exists`,
        { key: args.key },
      )
    }

    const localized = args.localized ?? false
    if (args.locale) {
      assertValidLocaleCode(args.locale, 'SITE_DATA_LOCALE_INVALID')
    }
    if (localized && args.data !== undefined && !args.locale) {
      throwCmsError(
        'SITE_DATA_LOCALE_REQUIRED',
        `Localized site data block "${args.key}" requires a locale when initial data is provided.`,
        { key: args.key },
      )
    }
    if (!localized && args.locale) {
      throwCmsError(
        'SITE_DATA_LOCALE_NOT_ALLOWED',
        `Non-localized site data block "${args.key}" cannot be created with a locale.`,
        { key: args.key, locale: args.locale },
      )
    }
    if (args.data !== undefined) assertJsonValue(args.data)

    const id = await ctx.db.insert('siteData', {
      key: args.key,
      label: args.label ?? null,
      schemaType: args.schemaType ?? null,
      localized,
      visibility: args.visibility ?? 'private',
      data: localized
        ? args.data === undefined
          ? {}
          : { [args.locale!]: args.data }
        : (args.data ?? null),
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    })

    await logActivity(ctx, {
      kind: 'siteData.created',
      summary: `Created site data "${args.key}"`,
      appIdentityId: appIdentity.userId,
      detail: { key: args.key },
    })

    return toStringId(id)
  },
})

export const saveSiteData = callerMutation.protected({
  id: 'siteData:saveSiteData',
  args: saveSiteDataArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    assertValidSiteDataKey(args.key)
    const row = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    if (!row) {
      throwCmsError('SITE_DATA_BLOCK_NOT_FOUND', `Site data block "${args.key}" not found`, {
        key: args.key,
      })
    }

    if (args.locale) {
      assertValidLocaleCode(args.locale, 'SITE_DATA_LOCALE_INVALID')
    }
    if (row.localized && !args.locale) {
      throwCmsError(
        'SITE_DATA_LOCALE_REQUIRED',
        `Localized site data block "${args.key}" requires a locale.`,
        { key: args.key },
      )
    }
    if (!row.localized && args.locale) {
      throwCmsError(
        'SITE_DATA_LOCALE_NOT_ALLOWED',
        `Non-localized site data block "${args.key}" cannot be saved with a locale.`,
        { key: args.key, locale: args.locale },
      )
    }
    assertJsonValue(args.data)

    const nextData = row.localized
      ? {
          ...localeDataMap(row.data),
          [args.locale!]: args.data,
        }
      : args.data

    const now = Date.now()
    await ctx.db.patch(row._id, {
      data: nextData,
      updatedBy: appIdentity.userId,
      updatedAt: now,
    })
    await revalidatePublicSiteDataIfNeeded(ctx, row, { appIdentityId: appIdentity.userId, now })

    await logActivity(ctx, {
      kind: 'siteData.saved',
      summary: `Saved site data "${args.key}"`,
      appIdentityId: appIdentity.userId,
      locale: args.locale ?? null,
      detail: { key: args.key },
    })

    return null
  },
})

export const updateSiteDataBlock = callerMutation.protected({
  id: 'siteData:updateSiteDataBlock',
  args: updateSiteDataBlockArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    assertValidSiteDataKey(args.key)
    const row = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    if (!row) {
      throwCmsError('SITE_DATA_BLOCK_NOT_FOUND', `Site data block "${args.key}" not found`, {
        key: args.key,
      })
    }

    const patch: Record<string, unknown> = {
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    }
    if (args.label !== undefined) patch.label = args.label
    if (args.schemaType !== undefined) patch.schemaType = args.schemaType
    if (args.localized !== undefined && args.localized !== row.localized) {
      throwCmsError(
        'SITE_DATA_LOCALIZATION_CHANGE_REQUIRES_MIGRATION',
        'Changing site data localization would reinterpret the stored data shape.',
        { key: args.key, currentLocalized: row.localized, requestedLocalized: args.localized },
      )
    }
    if (args.visibility !== undefined) patch.visibility = args.visibility

    await ctx.db.patch(row._id, patch)
    const previousVisibility = row.visibility ?? 'private'
    const nextVisibility = args.visibility ?? previousVisibility
    if (previousVisibility === 'public' || nextVisibility === 'public') {
      await enqueuePublicSiteDataRevalidation(ctx, {
        key: row.key,
        appIdentityId: appIdentity.userId,
        now: patch.updatedAt as number,
      })
    }

    await logActivity(ctx, {
      kind: 'siteData.saved',
      summary: `Updated site data metadata "${args.key}"`,
      appIdentityId: appIdentity.userId,
      detail: { key: args.key },
    })

    return null
  },
})

export const deleteSiteDataBlockOperation = defineCmsOperation({
  id: 'ginko-cms.delete-site-data-block',
  kind: 'destructive',
  executeFunctionRef: 'siteData:deleteSiteDataBlockOperationExecute',
  args: deleteSiteDataBlockArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    assertValidSiteDataKey(args.key)
    const row = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    return { row }
  },
  preview: async (_ctx, args, { row }) => {
    if (!row) {
      return blockedPreview({
        summary: 'Site data block not found.',
        blockers: [
          operationIssue({
            code: 'site-data-block-not-found',
            message: 'Site data block not found.',
          }),
        ],
        confirm: { operationId: 'ginko-cms.delete-site-data-block', args },
      })
    }
    return buildPreview({
      summary: `Will delete site data block "${args.key}".`,
      warnings: [
        operationIssue({
          code: 'frontend-data-removed',
          message: 'Any frontend reading this site data key will stop receiving data.',
        }),
      ],
      effects: [operationEffect({ kind: 'site-data-blocks', summary: 'Blocks deleted', count: 1 })],
      details: { key: row.key, updatedAt: row.updatedAt },
      confirm: {
        operationId: 'ginko-cms.delete-site-data-block',
        args,
        effect: {
          key: row.key,
          updatedAt: row.updatedAt,
        },
      },
      version: { updatedAt: row.updatedAt },
    })
  },
  handler: async (ctx, args, { row }) => {
    const appIdentity = await ctx.appIdentity()
    if (!row) return null
    await ctx.db.delete(row._id)
    await revalidatePublicSiteDataIfNeeded(ctx, row, {
      appIdentityId: appIdentity.userId,
      now: Date.now(),
    })

    await logActivity(ctx, {
      kind: 'siteData.deleted',
      summary: `Deleted site data "${args.key}"`,
      appIdentityId: appIdentity.userId,
      detail: { key: args.key },
    })
    return null
  },
})

export const deleteSiteDataBlockOperationExecute = callerMutation.protected(
  deleteSiteDataBlockOperation,
)
export const previewDeleteSiteDataBlockOperation = callerMutation.protected(
  Object.assign(definePreview(deleteSiteDataBlockOperation), {
    id: 'siteData:previewDeleteSiteDataBlockOperation',
  }),
)
