<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useMediaQuery } from '@vueuse/core'

import { cn } from '../ui/utils'

// Standard in-card split-pane (Phase L): a resizable navigation pane beside
// the pane's content, template-Mail-style. This is the ONE sanctioned way to
// put scoped navigation INSIDE the inset card — detail surfaces belong in the
// shell's right sidebar instead (useRightSidebarPanel). Pane sizes persist
// per storageId via reka-ui's splitter auto-save (localStorage). Below md the
// nav pane collapses away entirely (consumers keep offering a mobile path,
// e.g. a select or sheet), matching the previous hidden-below-md behavior.
const props = withDefaults(
  defineProps<{
    /** localStorage key for the persisted pane layout. */
    storageId: string
    navDefaultSize?: number
    navMinSize?: number
    navMaxSize?: number
    class?: HTMLAttributes['class']
  }>(),
  {
    navDefaultSize: 18,
    navMinSize: 12,
    navMaxSize: 32,
  },
)

const mdUp = useMediaQuery('(min-width: 768px)')
</script>

<template>
  <ResizablePanelGroup
    :auto-save-id="storageId"
    direction="horizontal"
    :class="cn('ginko:min-h-0 ginko:flex-1', props.class)"
  >
    <template v-if="mdUp">
      <ResizablePanel
        :default-size="navDefaultSize"
        :min-size="navMinSize"
        :max-size="navMaxSize"
        class="ginko:@container ginko:flex ginko:min-w-44 ginko:flex-col ginko:bg-muted/20"
      >
        <slot name="nav" />
      </ResizablePanel>
      <ResizableHandle />
    </template>
    <ResizablePanel class="ginko:@container ginko:flex ginko:min-w-0 ginko:flex-col">
      <slot />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
