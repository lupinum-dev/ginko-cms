<script setup lang="ts">
// Pure presentational metadata table (props only, no inject). Dedupes the
// filename/kind/size/ownership row block that the pick aside, the mobile
// details sheet, and the manage drawer each render. Consumers pass a fully
// resolved (translated) row list so this stays free of i18n and finder deps.
export interface StudioAssetInfoRow {
  label: string
  value: string
  /** Render the value inside an outline Badge instead of a plain span. */
  badge?: boolean
  /** Extra layout classes for the row wrapper (defaults to flex/justify-between). */
  rowClass?: string
  /** Extra classes for the value span (mono, truncate, max-width, …). */
  valueClass?: string
}

defineProps<{
  rows: StudioAssetInfoRow[]
}>()
</script>

<template>
  <div class="ginko:space-y-2.5 ginko:text-xs">
    <div
      v-for="(row, index) in rows"
      :key="index"
      :class="row.rowClass ?? 'ginko:flex ginko:justify-between'"
    >
      <span class="ginko:text-muted-foreground/70">{{ row.label }}</span>
      <Badge v-if="row.badge" variant="outline" class="ginko:text-xs">{{ row.value }}</Badge>
      <span v-else :class="row.valueClass">{{ row.value }}</span>
    </div>
  </div>
</template>
