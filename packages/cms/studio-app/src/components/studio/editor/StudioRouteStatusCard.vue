<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import {
  statusToneClass,
  type StudioPublicVisibilityState,
  type StudioRouteValidationState,
} from './studioWorkflowTypes'

const props = defineProps<{
  publicVisibility: StudioPublicVisibilityState
  routeValidationRequested: boolean
  routeValidationState: StudioRouteValidationState
}>()

const emit = defineEmits<{
  validatePublicRoutes: []
}>()

const { t } = useCmsI18n()
const td = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.entryDetails.${key}`, params)

const currentRoute = computed(() => props.publicVisibility.localeRows.find((row) => row.current))
const routePath = computed(
  () =>
    currentRoute.value?.href || currentRoute.value?.publishedPath || currentRoute.value?.path || '',
)
const routeLabel = computed(
  () =>
    currentRoute.value?.label ||
    (props.publicVisibility.isRouteBacked ? td('statusUnknown') : td('routeSharedData')),
)
</script>

<template>
  <StudioInspectorSection :title="td('urlDiagnostics')">
    <div class="ginko:min-w-0">
      <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-muted-foreground">
        {{ routePath || td('noPageUrl') }}
      </div>
      <Badge
        variant="outline"
        class="ginko:mt-3"
        :class="statusToneClass(currentRoute?.label?.toLowerCase())"
      >
        {{ routeLabel }}
      </Badge>
    </div>
    <div class="ginko:mt-4 ginko:grid ginko:gap-2">
      <Button v-if="routePath" variant="outline" size="sm" as-child>
        <a :href="routePath" target="_blank" rel="noreferrer" class="ginko:gap-2">
          <ExternalLink class="ginko:size-4" />
          {{ td('openInSite') }}
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="!publicVisibility.isRouteBacked"
        @click="emit('validatePublicRoutes')"
      >
        {{ routeValidationRequested ? routeValidationState.state : td('checkLinks') }}
      </Button>
    </div>
  </StudioInspectorSection>
</template>
