<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { computed } from 'vue'

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

const currentRoute = computed(() => props.publicVisibility.localeRows.find((row) => row.current))
const routePath = computed(
  () =>
    currentRoute.value?.href || currentRoute.value?.publishedPath || currentRoute.value?.path || '',
)
const routeLabel = computed(
  () =>
    currentRoute.value?.label || (props.publicVisibility.isRouteBacked ? 'Unknown' : 'Data-only'),
)
</script>

<template>
  <StudioInspectorSection title="Route diagnostics">
    <div class="ginko:min-w-0">
      <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-muted-foreground">
        {{ routePath || 'No public route' }}
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
          Open in site
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="!publicVisibility.isRouteBacked"
        @click="emit('validatePublicRoutes')"
      >
        {{ routeValidationRequested ? routeValidationState.state : 'Check links' }}
      </Button>
    </div>
  </StudioInspectorSection>
</template>
