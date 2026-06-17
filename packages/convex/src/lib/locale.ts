import type { GinkoRoutingLocale } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { ReadCtx } from './types.js'

export async function getCmsSettings(ctx: ReadCtx) {
  return await ctx.db
    .query('cmsSettings')
    .withIndex('by_key', (q) => q.eq('key', 'site'))
    .first()
}

export async function getLocaleChain(
  ctx: ReadCtx,
  locale: string,
): Promise<{ locale: string; chain: string[]; defaultLocale: string }> {
  const settings = await getCmsSettings(ctx)
  const locales = settings?.locales ?? [{ code: locale, isDefault: true }]
  const defaultLocale = locales.find((entry) => entry.isDefault)?.code ?? locales[0]?.code ?? locale
  const seen = new Set<string>()
  const chain: string[] = []
  let current: string | undefined = locale

  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = locales.find((entry) => entry.code === current)?.fallback
  }

  if (!seen.has(defaultLocale)) {
    chain.push(defaultLocale)
  }

  return { locale, chain, defaultLocale }
}

export async function getRoutingLocales(
  ctx: ReadCtx,
  fallbackLocales: string[],
): Promise<GinkoRoutingLocale[]> {
  const settings = await getCmsSettings(ctx)
  const configuredLocales = settings?.locales ?? []
  const defaultLocale =
    configuredLocales.find((locale) => locale.isDefault)?.code ??
    configuredLocales[0]?.code ??
    fallbackLocales[0]
  const codes = configuredLocales.length
    ? configuredLocales.map((locale) => locale.code)
    : fallbackLocales

  return codes.map((code) => ({
    code,
    prefix: code === defaultLocale ? '' : `/${code}`,
    default: code === defaultLocale,
  }))
}

export function resolveLocaleText(
  value: string | Record<string, string> | null | undefined,
  locale: string,
  fallbacks: string[] = [],
): string {
  if (!value) return ''
  if (typeof value === 'string') return value

  for (const code of [locale, ...fallbacks]) {
    const resolved = value[code]
    if (resolved) return resolved
  }

  return Object.values(value).find(Boolean) ?? ''
}
