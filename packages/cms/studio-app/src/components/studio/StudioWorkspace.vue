<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  class?: HTMLAttributes['class']
  rail?: boolean
  railCollapsed?: boolean
}>()

const slots = useSlots()
</script>

<template>
  <section
    :class="
      cn(
        'studio-workspace ginko:min-h-0 ginko:flex-1 ginko:overflow-hidden ginko:bg-transparent',
        'ginko:w-full ginko:min-w-0 ginko:max-w-full',
        slots.toolbar && 'studio-workspace--with-toolbar',
        rail && 'studio-workspace--rail',
        rail && railCollapsed && 'studio-workspace--rail-collapsed',
        $props.class,
      )
    "
  >
    <div v-if="slots.header" class="studio-workspace__header">
      <slot name="header" />
    </div>
    <div v-if="slots.toolbar" class="studio-workspace__toolbar">
      <slot name="toolbar" />
    </div>
    <main class="studio-workspace__main">
      <slot />
    </main>
    <aside v-if="rail" class="studio-workspace__rail">
      <slot name="rail" />
    </aside>
  </section>
</template>

<style scoped>
.studio-workspace {
  display: grid;
  grid-template-areas:
    'header'
    'main';
  grid-template-rows: auto minmax(0, 1fr);
}

.studio-workspace--with-toolbar {
  grid-template-areas:
    'header'
    'toolbar'
    'main';
  grid-template-rows: auto auto minmax(0, 1fr);
}

.studio-workspace__header {
  grid-area: header;
  min-width: 0;
}

.studio-workspace__toolbar {
  grid-area: toolbar;
  min-width: 0;
}

.studio-workspace__main {
  grid-area: main;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.studio-workspace__rail {
  display: none;
  grid-area: rail;
  min-width: 0;
  min-height: 0;
}

.studio-workspace {
  box-shadow: none;
}

@media (min-width: 1280px) {
  .studio-workspace--rail {
    grid-template-areas:
      'header rail'
      'main rail';
    grid-template-columns: minmax(0, 1fr) var(--studio-action-rail-width);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .studio-workspace--rail.studio-workspace--with-toolbar {
    grid-template-areas:
      'header rail'
      'toolbar rail'
      'main rail';
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .studio-workspace--rail-collapsed {
    grid-template-columns: minmax(0, 1fr) var(--studio-action-rail-collapsed-width);
  }

  .studio-workspace__rail {
    display: block;
    overflow: hidden;
    border-left: 1px solid var(--studio-divider);
    background: var(--card);
  }
}
</style>
