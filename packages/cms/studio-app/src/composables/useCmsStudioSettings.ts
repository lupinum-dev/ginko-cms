import type { CmsStudioSettingsQueryResult } from '@public/types'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from './useCmsConfig'
import { useCmsStudioQuery } from './useCmsStudioQuery'

type CmsLocale = {
  code: string
  label?: string
  isDefault?: boolean
  fallback?: string
}

// Studio-side settings projection derived from the explicit host bridge query.
export function useCmsStudioSettings() {
  const config = useCmsConfig()
  const query = useCmsStudioQuery(api.ginkoCms.settings.getStudioSettings, {})

  const locales = computed<CmsLocale[]>(() => {
    const persisted = (query.data?.value as CmsStudioSettingsQueryResult | null | undefined)
      ?.locales
    if (Array.isArray(persisted) && persisted.length > 0) {
      return persisted
    }
    return config.locales ?? []
  })

  const defaultLocale = computed(() => {
    return (
      locales.value.find((locale) => locale.isDefault)?.code ??
      config.defaultLocale ??
      locales.value[0]?.code ??
      'en'
    )
  })

  return {
    ...query,
    locales,
    defaultLocale,
  }
}
