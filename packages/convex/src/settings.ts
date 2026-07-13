import { updateSettings as updateSettingsArgs } from '@lupinum/ginko-cms-contract/convex/schemas/settings.js'
import {
  cmsSettingsValidator,
  studioSettingsValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canManageSettings, canRead } from './auth/checks.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { getCmsSettings } from './lib/locale.js'

function serializeStudioSettings(settings: Awaited<ReturnType<typeof getCmsSettings>>) {
  if (!settings) return null

  return {
    locales: settings.locales ?? [],
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy ?? null,
  }
}

function serializeCmsSettings(settings: Awaited<ReturnType<typeof getCmsSettings>>) {
  if (!settings) return null

  return {
    key: 'site' as const,
    locales: settings.locales ?? [],
    webhooks: settings.webhooks ?? [],
    updatedBy: settings.updatedBy ?? null,
    updatedAt: settings.updatedAt,
  }
}

function assertWebhookUrl(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('WEBHOOK_URL_INVALID')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('WEBHOOK_URL_HTTPS_REQUIRED')
  }
}

export const getStudioSettings = callerQuery.protected({
  id: 'settings:getStudioSettings',
  args: {},
  guard: canRead,
  returns: studioSettingsValidator,
  handler: async (ctx) => serializeStudioSettings(await getCmsSettings(ctx)),
})

export const getSettings = callerQuery.protected({
  id: 'settings:getSettings',
  args: {},
  guard: canManageSettings,
  returns: cmsSettingsValidator,
  handler: async (ctx) => serializeCmsSettings(await getCmsSettings(ctx)),
})

export const updateSettings = callerMutation.protected({
  id: 'settings:updateSettings',
  args: updateSettingsArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const existing = await getCmsSettings(ctx)
    const patch: Record<string, unknown> = {
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    }
    if (args.webhooks !== undefined) {
      ;(args.webhooks as Array<{ url: string }>).forEach((webhook) => assertWebhookUrl(webhook.url))
      patch.webhooks = args.webhooks
    }

    if (!existing) {
      await ctx.db.insert('cmsSettings', {
        key: 'site',
        locales: [],
        webhooks: args.webhooks ?? [],
        updatedBy: appIdentity.userId,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.patch(existing._id, patch)
    }

    await logActivity(ctx, {
      kind: 'settings.updated',
      summary: 'Updated CMS settings',
      appIdentityId: appIdentity.userId,
      detail: {
        changes: Object.keys(args),
      },
    })

    return null
  },
})
