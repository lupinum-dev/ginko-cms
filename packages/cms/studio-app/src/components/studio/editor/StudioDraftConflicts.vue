<script setup lang="ts">
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { fieldDisplayLabel, humanizeFieldKey } from '../../../lib/fieldLabel'
const props = defineProps<{
  conflicts: Array<{ path: string[]; before: unknown; mine: unknown; shared: unknown }>
  fields: Array<{ key: string; label?: unknown }>
}>()
const emit = defineEmits<{ resolve: [path: string[], choice: 'mine' | 'shared'] }>()
const { t, currentLocale } = useCmsI18n()
const label = (key: string) => t(`ginkoCms.studio.draftConflict.${key}`)
function fieldLabel(path: string[]) {
  const key = path.at(-1) ?? ''
  const field = props.fields.find((field) => field.key === key)
  return field ? fieldDisplayLabel(field, currentLocale.value) : humanizeFieldKey(key)
}
function preview(value: unknown): string {
  return value === undefined || value === null || value === ''
    ? label('empty')
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
}
</script>
<template>
  <section
    aria-live="polite"
    class="ginko:grid ginko:gap-4 ginko:rounded-lg ginko:border ginko:border-warning/40 ginko:bg-warning/5 ginko:p-4"
  >
    <div>
      <h2 class="ginko:text-sm ginko:font-semibold">{{ label('title') }}</h2>
      <p class="ginko:mt-1 ginko:text-sm ginko:text-muted-foreground">{{ label('description') }}</p>
    </div>
    <div
      v-for="conflict in conflicts"
      :key="JSON.stringify(conflict.path)"
      class="ginko:grid ginko:gap-2"
    >
      <h3 class="ginko:text-sm ginko:font-medium">{{ fieldLabel(conflict.path) }}</h3>
      <div class="studio-draft-conflict__choices">
        <div class="ginko:min-w-0 ginko:rounded-md ginko:border ginko:bg-card ginko:p-3">
          <p class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ label('mine') }}
          </p>
          <pre class="studio-draft-conflict__value">{{ preview(conflict.mine) }}</pre>
          <Button size="sm" variant="outline" @click="emit('resolve', conflict.path, 'mine')">{{
            label('keepMine')
          }}</Button>
        </div>
        <div class="ginko:min-w-0 ginko:rounded-md ginko:border ginko:bg-card ginko:p-3">
          <p class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ label('shared') }}
          </p>
          <pre class="studio-draft-conflict__value">{{ preview(conflict.shared) }}</pre>
          <Button size="sm" variant="outline" @click="emit('resolve', conflict.path, 'shared')">{{
            label('useShared')
          }}</Button>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.studio-draft-conflict__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 0.75rem;
}
.studio-draft-conflict__value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  font-size: 0.875rem;
  max-height: 10rem;
  overflow: auto;
  margin: 0.5rem 0 0.75rem;
}
</style>
