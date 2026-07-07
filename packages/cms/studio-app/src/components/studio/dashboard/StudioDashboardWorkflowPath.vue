<script setup lang="ts">
import { studioWorkflowSpineText } from '../../../lib/studioWorkflowSpine'

type DashboardWorkflowTone = 'danger' | 'info' | 'neutral' | 'warning'

type DashboardWorkflowStep = {
  key: string
  label: string
  description: string
  signal: number | string
  signalLabel: string
  icon: unknown
  tone: DashboardWorkflowTone
  to?: string
}

defineProps<{
  rows: DashboardWorkflowStep[]
}>()

function metricToneClass(tone: DashboardWorkflowTone) {
  switch (tone) {
    case 'danger':
      return 'ginko:border-destructive/40 ginko:bg-destructive/10 ginko:text-destructive-fg'
    case 'warning':
      return 'ginko:border-warning/40 ginko:bg-warning/10 ginko:text-warning-fg'
    case 'info':
      return 'ginko:border-primary/30 ginko:bg-primary/5 ginko:text-primary'
    default:
      return 'ginko:border-border ginko:bg-card ginko:text-muted-foreground'
  }
}
</script>

<template>
  <section
    aria-label="Publishing workflow"
    class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
  >
    <div
      class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
    >
      <div>
        <h2 class="studio-text-title">Publishing path</h2>
        <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
          {{ studioWorkflowSpineText }}
        </p>
      </div>
      <Badge variant="outline" class="ginko:text-xs">Website workflow</Badge>
    </div>
    <div
      role="list"
      class="ginko:grid ginko:divide-y ginko:divide-border/70 ginko:lg:grid-cols-6 ginko:lg:divide-x ginko:lg:divide-y-0"
    >
      <component
        :is="step.to ? 'RouterLink' : 'div'"
        v-for="step in rows"
        :key="step.key"
        :to="step.to"
        role="listitem"
        class="ginko:grid ginko:min-h-40 ginko:content-between ginko:gap-4 ginko:px-4 ginko:py-3 ginko:text-left ginko:transition-colors ginko:hover:bg-accent/40"
      >
        <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-2">
          <span
            class="ginko:grid ginko:size-9 ginko:place-items-center ginko:rounded-md ginko:border"
            :class="metricToneClass(step.tone)"
          >
            <component :is="step.icon" class="ginko:size-4" />
          </span>
          <span class="ginko:text-sm ginko:font-semibold ginko:tabular-nums">
            {{ step.signal }}
          </span>
        </div>
        <div>
          <div class="ginko:text-sm ginko:font-medium ginko:text-foreground">
            {{ step.label }}
          </div>
          <p class="ginko:mt-1 ginko:text-xs ginko:leading-5 ginko:text-muted-foreground">
            {{ step.description }}
          </p>
        </div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
          {{ step.signalLabel }}
        </div>
      </component>
    </div>
  </section>
</template>
