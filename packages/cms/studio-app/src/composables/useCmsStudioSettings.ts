import type { CmsStudioSettingsQueryResult } from '@public/types'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { useCmsStudioQuery } from './useCmsStudioQuery'

type CmsLocale = {
  code: string
  label?: string
  isDefault?: boolean
  fallback?: string
}

// Studio locale state comes only from the installed contract projection.
export function useCmsStudioSettings() {
  const query = useCmsStudioQuery(api.ginkoCms.settings.getStudioSettings, {})

  const locales = computed<CmsLocale[]>(() => {
    const persisted = (query.data?.value as CmsStudioSettingsQueryResult | null | undefined)
      ?.locales
    return Array.isArray(persisted) ? persisted : []
  })

  const defaultLocale = computed(() => {
    return locales.value.find((locale) => locale.isDefault)?.code ?? locales.value[0]?.code ?? 'en'
  })

  return {
    ...query,
    locales,
    defaultLocale,
  }
}
