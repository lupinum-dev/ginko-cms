import type { GinkoRoutingLocale } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import { readInstalledCmsContract } from './installedContract.js'
import type { ReadCtx } from './types.js'

export async function getCmsSettings(ctx: ReadCtx) {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) return null
  const { content, record } = installed
  return {
    locales: content.locales.map((code) => ({
      code,
      label: code,
      ...(code === content.defaultLocale ? { isDefault: true } : {}),
      ...(content.localeFallbacks[code]?.[0] ? { fallback: content.localeFallbacks[code][0] } : {}),
    })),
    updatedAt: record.installedAt,
    updatedBy: record.installedBy,
    installedContentHash: record.contentHash,
    installedPresentationHash: record.presentationHash,
    transitionState: record.transitionState,
    transitionRunId: record.transitionRunId ?? null,
  }
}

export async function getLocaleChain(
  ctx: ReadCtx,
  locale: string,
): Promise<{ locale: string; chain: string[]; defaultLocale: string }> {
  const installed = await readInstalledCmsContract(ctx)
  const contract = installed?.content
  if (contract) {
    return {
      locale,
      chain: Array.from(new Set([locale, ...(contract.localeFallbacks[locale] ?? [])])),
      defaultLocale: contract.defaultLocale,
    }
  }
  return { locale, chain: [locale], defaultLocale: locale }
}

export async function getRoutingLocales(
  ctx: ReadCtx,
  fallbackLocales: string[],
  preferredDefaultLocale?: string,
): Promise<GinkoRoutingLocale[]> {
  const installed = await readInstalledCmsContract(ctx)
  const configuredLocales = installed?.content.locales ?? []
  const defaultLocale =
    preferredDefaultLocale ??
    installed?.content.defaultLocale ??
    configuredLocales[0] ??
    fallbackLocales[0]
  const codes = fallbackLocales.length ? fallbackLocales : configuredLocales

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
