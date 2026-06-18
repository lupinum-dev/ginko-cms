import { updateSettings as updateSettingsArgs } from '@lupinum/ginko-cms-contract/convex/schemas/settings.js'
import {
  cmsSettingsValidator,
  localeConfigValidator,
  studioSettingsValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canManageSettings, canRead } from './auth/checks.js'
import { callerMutation, callerQuery, unsafePermit, unsafeRaw } from './functions.js'
import { logActivity } from './lib/activity.js'
import { getCmsSettings } from './lib/locale.js'
import { assertValidLocaleCode } from './lib/validation.js'

const bootstrapSettingsResultValidator = v.object({
  created: v.boolean(),
  updated: v.boolean(),
})

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

// AUTH-AUDIT: intentionally unguarded — called by the Convex component installer
// to seed initial CMS settings before any user exists.
export const syncBootstrapSettings = unsafeRaw.mutation({
  permit: unsafePermit.permit({
    kind: 'bootstrapSettingsSeed',
    reason: 'Seed bootstrap settings before a CMS appIdentity exists.',
    scope: ['settings'],
  }),
  args: {
    locales: v.array(localeConfigValidator),
  },
  returns: bootstrapSettingsResultValidator,
  handler: async (ctx, args) => {
    args.locales.forEach((locale) => assertValidLocaleCode(locale.code, 'SETTINGS_LOCALE_INVALID'))
    const existing = await getCmsSettings(ctx)
    if (!existing) {
      await ctx.db.insert('cmsSettings', {
        key: 'site',
        locales: args.locales,
        webhooks: [],
        updatedBy: 'bootstrap',
        updatedAt: Date.now(),
      })
      return { created: true, updated: false }
    }

    if ((existing.locales?.length ?? 0) > 0) {
      return { created: false, updated: false }
    }

    await ctx.db.patch(existing._id, {
      locales: args.locales,
      updatedBy: 'bootstrap',
      updatedAt: Date.now(),
    })
    return { created: false, updated: true }
  },
})

export const updateSettings = callerMutation.protected({
  id: 'settings:updateSettings',
  args: updateSettingsArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const existing = await getCmsSettings(ctx)
    args.locales?.forEach((locale) => assertValidLocaleCode(locale.code, 'SETTINGS_LOCALE_INVALID'))
    const patch: Record<string, unknown> = {
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    }
    if (args.locales !== undefined) patch.locales = args.locales
    if (args.webhooks !== undefined) {
      args.webhooks.forEach((webhook) => assertWebhookUrl(webhook.url))
      patch.webhooks = args.webhooks
    }

    if (!existing) {
      await ctx.db.insert('cmsSettings', {
        key: 'site',
        locales: args.locales ?? [],
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
