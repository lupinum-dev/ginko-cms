import type { ResolvedContentContractV1 } from '@lupinum/ginko-content/cms-contract'

type ContentRuntimePolicy = {
  contract?: ResolvedContentContractV1
  defaultLocale?: string
  locales?: string[]
}

export type ContentRuntimeConfig = {
  content?: ContentRuntimePolicy
  public?: { content?: ContentRuntimePolicy }
}

export function resolveContentRuntimePolicy(runtimeConfig: ContentRuntimeConfig) {
  const privateContent = runtimeConfig.content
  const publicContent = runtimeConfig.public?.content
  const locales = privateContent?.contract?.locales.length
    ? privateContent.contract.locales
    : privateContent?.locales?.length
      ? privateContent.locales
      : publicContent?.locales?.length
        ? publicContent.locales
        : []
  return {
    defaultLocale:
      privateContent?.contract?.defaultLocale ??
      privateContent?.defaultLocale ??
      publicContent?.defaultLocale ??
      locales[0] ??
      'en',
    locales,
  }
}
