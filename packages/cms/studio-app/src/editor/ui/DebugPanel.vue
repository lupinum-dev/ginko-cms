<script setup lang="ts">
import type { EditorDebugEvent } from '../lib/debug'

defineProps<{
  events: EditorDebugEvent[]
}>()

const emit = defineEmits<{
  clear: []
  export: []
}>()
</script>

<template>
  <div class="ginko:border-t ginko:bg-slate-950 ginko:text-slate-100">
    <div
      class="ginko:flex ginko:items-center ginko:gap-2 ginko:border-b ginko:border-slate-800 ginko:px-3 ginko:py-2"
    >
      <div
        class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-[0.2em] ginko:text-slate-300"
      >
        Debug Timeline
      </div>
      <div class="ginko:ml-auto ginko:text-xs ginko:text-slate-400">{{ events.length }} events</div>
      <Button
        size="sm"
        variant="outline"
        class="ginko:h-7 ginko:border-slate-700 ginko:bg-slate-900 ginko:text-slate-100"
        @click="emit('clear')"
      >
        Clear
      </Button>
      <Button
        size="sm"
        variant="outline"
        class="ginko:h-7 ginko:border-slate-700 ginko:bg-slate-900 ginko:text-slate-100"
        @click="emit('export')"
      >
        Export
      </Button>
    </div>
    <div class="ginko:max-h-[320px] ginko:overflow-auto ginko:px-3 ginko:py-2">
      <div
        v-for="event in [...events].reverse()"
        :key="event.id"
        class="ginko:border-b ginko:border-slate-900 ginko:py-2 ginko:last:border-b-0"
      >
        <div
          class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-[11px] ginko:text-slate-400"
        >
          <span
            class="ginko:rounded ginko:bg-slate-900 ginko:px-1.5 ginko:py-0.5 ginko:uppercase"
            >{{ event.level }}</span
          >
          <span>{{ event.source }}</span>
          <span class="ginko:ml-auto">{{ event.timestamp }}</span>
        </div>
        <div class="ginko:mt-1 ginko:text-sm ginko:text-slate-100">
          {{ event.message }}
        </div>
        <pre
          v-if="event.payload !== undefined"
          class="ginko:mt-2 ginko:overflow-auto ginko:rounded ginko:bg-slate-900 ginko:p-2 ginko:text-[11px] ginko:leading-5 ginko:text-slate-300"
          >{{ JSON.stringify(event.payload, null, 2) }}</pre
        >
      </div>
    </div>
  </div>
</template>
