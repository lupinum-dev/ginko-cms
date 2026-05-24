<script setup lang="ts">
import { diagnosticLabel, type StudioWorkflowDiagnostic } from './studioWorkflowTypes'

defineProps<{
  diagnostics: StudioWorkflowDiagnostic[]
  hiddenCount?: number
  itemKeyPrefix: string
  moreLabel: string
}>()
</script>

<template>
  <div v-if="diagnostics.length" class="ginko:space-y-2">
    <div
      v-for="diagnostic in diagnostics"
      :key="`${itemKeyPrefix}:${diagnostic.code}:${diagnostic.locale}:${diagnostic.href}:${diagnostic.path}:${diagnostic.message}`"
      class="ginko:rounded-md ginko:border ginko:px-3 ginko:py-2 ginko:text-xs"
      :class="
        diagnostic.severity === 'error'
          ? 'ginko:border-destructive/40 ginko:text-destructive'
          : 'ginko:text-muted-foreground'
      "
    >
      <div class="ginko:font-medium ginko:text-current">{{ diagnosticLabel(diagnostic.code) }}</div>
      <div class="ginko:mt-0.5">{{ diagnostic.message }}</div>
      <div
        v-if="diagnostic.href || diagnostic.path"
        class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-[10px] ginko:opacity-75"
      >
        {{ diagnostic.href || diagnostic.path }}
      </div>
    </div>
    <div v-if="hiddenCount" class="ginko:text-xs ginko:text-muted-foreground">
      +{{ hiddenCount }} more {{ moreLabel }}{{ hiddenCount === 1 ? '' : 's' }}
    </div>
  </div>
</template>
