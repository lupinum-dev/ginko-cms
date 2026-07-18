import {
  resolveContractCompatibility,
  type GinkoCmsInstalledContractStatus,
} from '@public/contract-compatibility'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from './useCmsConfig'
import { useCmsStudioQuery } from './useCmsStudioQuery'

export function useCmsContractCompatibility() {
  const config = useCmsConfig()
  const query = useCmsStudioQuery(api.ginkoCms.contract.getInstalledContractStatus, {})
  const installed = computed(() => query.data.value as GinkoCmsInstalledContractStatus | null)
  const compatibility = computed(() => {
    if (!installed.value) return null
    return resolveContractCompatibility(config.contract, installed.value)
  })

  return {
    compatibility,
    query,
  }
}
