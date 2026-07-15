<script setup lang="ts">
import StudioWorkflowDiagnosticsList from './StudioWorkflowDiagnosticsList.vue'
import { statusToneClass, type StudioLocaleVisibilityRow } from './studioWorkflowTypes'

defineProps<{
  localeState: StudioLocaleVisibilityRow
}>()
</script>

<template>
  <div
    class="ginko:rounded-md ginko:border ginko:bg-background ginko:p-3"
    :class="localeState.current ? 'ginko:border-primary/50' : ''"
  >
    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2">
      <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2">
        <Badge variant="outline" class="ginko:text-xs ginko:font-mono">
          {{ localeState.locale }}
        </Badge>
        <Badge variant="outline" :class="statusToneClass(localeState.label.toLowerCase())">
          {{ localeState.label }}
        </Badge>
        <Badge v-if="localeState.current" variant="secondary" class="ginko:text-xs">
          Current
        </Badge>
      </div>
      <span
        class="ginko:max-w-full ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
      >
        {{ localeState.href || localeState.publishedPath || localeState.path || 'Not published' }}
      </span>
    </div>

    <div
      class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:sm:grid-cols-3"
    >
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          Draft
        </div>
        <div class="ginko:mt-0.5 ginko:text-foreground">{{ localeState.draftState }}</div>
        <div class="ginko:truncate ginko:font-mono ginko:text-xs">
          {{ localeState.draftPath || localeState.path || 'no URL' }}
        </div>
      </div>
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          Live
        </div>
        <div class="ginko:mt-0.5 ginko:text-foreground">{{ localeState.publishedState }}</div>
        <div class="ginko:truncate ginko:font-mono ginko:text-xs">
          {{ localeState.href || localeState.publishedPath || 'no URL' }}
        </div>
      </div>
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          Website surfaces
        </div>
        <div class="ginko:mt-0.5 ginko:flex ginko:flex-wrap ginko:gap-1">
          <Badge variant="outline" class="ginko:text-xs">Sitemap {{ localeState.sitemap }}</Badge>
          <Badge variant="outline" class="ginko:text-xs">Search {{ localeState.search }}</Badge>
          <Badge variant="outline" class="ginko:text-xs">Nav {{ localeState.nav }}</Badge>
        </div>
      </div>
    </div>

    <div
      v-if="localeState.missingRequiredFields.length || localeState.secondaryLabels.length"
      class="ginko:mt-3 ginko:flex ginko:flex-wrap ginko:gap-1 ginko:text-xs"
    >
      <Badge
        v-if="localeState.missingRequiredFields.length"
        variant="outline"
        class="ginko:border-destructive/40 ginko:text-destructive"
      >
        Missing {{ localeState.missingRequiredFields.join(', ') }}
      </Badge>
      <Badge
        v-for="label in localeState.secondaryLabels"
        :key="`secondary:${localeState.locale}:${label}`"
        variant="outline"
      >
        {{ label }}
      </Badge>
    </div>

    <div
      v-if="localeState.reasons.length"
      class="ginko:mt-2 ginko:flex ginko:flex-wrap ginko:gap-1"
    >
      <Badge
        v-for="reason in localeState.reasons"
        :key="`reason:${localeState.locale}:${reason}`"
        variant="outline"
        class="ginko:text-xs"
      >
        {{ reason }}
      </Badge>
    </div>

    <p
      v-if="localeState.draftPath && localeState.href && localeState.draftPath !== localeState.href"
      class="ginko:mt-2 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
    >
      Live URL differs from the editable slug because this collection uses stable URLs.
    </p>

    <StudioWorkflowDiagnosticsList
      class="ginko:mt-3"
      :diagnostics="localeState.visibleDiagnostics"
      :hidden-count="localeState.hiddenDiagnosticCount"
      :item-key-prefix="`locale:${localeState.locale}`"
      more-label="diagnostic"
    />
  </div>
</template>
