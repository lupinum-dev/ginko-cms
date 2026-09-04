<script setup lang="ts">
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { diagnosticLabel, type StudioWorkflowDiagnostic } from './studioWorkflowTypes'

const props = defineProps<{
  diagnostics: StudioWorkflowDiagnostic[]
  hiddenCount?: number
  itemKeyPrefix: string
  moreLabelKey: string
}>()

const { t } = useCmsI18n()

function moreLabel(count: number): string {
  const variant = count === 1 ? 'One' : 'Other'
  return t(`ginkoCms.studio.collectionEditor.diagnosticsMore${props.moreLabelKey}${variant}`, {
    count,
  })
}
</script>

<template>
  <div v-if="diagnostics.length" class="ginko:min-w-0 ginko:space-y-2">
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
        class="ginko:mt-1 ginko:break-all ginko:font-mono ginko:text-xs ginko:opacity-75"
      >
        {{ diagnostic.href || diagnostic.path }}
      </div>
    </div>
    <div v-if="hiddenCount" class="ginko:text-xs ginko:text-muted-foreground">
      {{ moreLabel(hiddenCount) }}
    </div>
  </div>
</template>
