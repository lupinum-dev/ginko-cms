<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
import { computed } from 'vue'

import { useCmsContractCompatibility } from '../../composables/useCmsContractCompatibility'
import { useCmsI18n } from '../../composables/useCmsI18n'

const contract = useCmsContractCompatibility()
const { t } = useCmsI18n()
const compatibility = computed(() => contract.compatibility.value)
const visible = computed(() => compatibility.value && !compatibility.value.writable)
</script>

<template>
  <div
    v-if="visible"
    class="ginko:shrink-0 ginko:border-b ginko:border-amber-500/30 ginko:bg-amber-500/10 ginko:px-4 ginko:py-2 ginko:text-xs ginko:text-foreground ginko:md:px-6"
    data-testid="cms-contract-write-blocked"
    role="alert"
  >
    <div class="ginko:flex ginko:items-start ginko:gap-2">
      <AlertTriangle class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-amber-600" />
      <div class="ginko:min-w-0">
        <p class="ginko:font-medium">
          {{ t('ginkoCms.studio.layout.contractWriteBlockedTitle') }}
        </p>
        <p class="ginko:mt-0.5 ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.layout.contractWriteBlockedDescription') }}
        </p>
      </div>
    </div>
  </div>
</template>
