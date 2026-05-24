<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  class?: HTMLAttributes['class']
  rail?: boolean
}>()
</script>

<template>
  <section
    :class="
      cn(
        'studio-workspace ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col ginko:overflow-hidden ginko:bg-transparent',
        'ginko:w-full ginko:min-w-0 ginko:max-w-full',
        $props.class,
      )
    "
  >
    <slot name="header" />
    <slot name="toolbar" />
    <div :class="cn('studio-workspace__body', rail ? 'studio-workspace__body--rail' : '')">
      <main class="studio-workspace__main">
        <slot />
      </main>
      <aside v-if="rail" class="studio-workspace__rail">
        <slot name="rail" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.studio-workspace__body {
  position: relative;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
}

.studio-workspace__main {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.studio-workspace__rail {
  min-width: 0;
  height: 100%;
  border-left: 1px solid var(--studio-divider);
  background: var(--card);
}

.studio-workspace {
  box-shadow: none;
}

@media (min-width: 1280px) {
  .studio-workspace__body--rail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17.5rem;
  }

  .studio-workspace__rail {
    width: auto;
  }
}
</style>
