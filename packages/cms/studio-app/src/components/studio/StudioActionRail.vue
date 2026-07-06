<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'

import { useStudioActionRailController } from '../../composables/useStudioActionRailController'
import { cn } from '../ui/utils'

withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    sheetDescription?: string
    sheetTitle?: string
    title?: string
  }>(),
  {
    sheetDescription: 'Status and available actions for this view.',
    sheetTitle: 'Details',
    title: 'Details',
  },
)

const slots = useSlots()
const { open, railAsColumn, setSheetOpen, showSheet } = useStudioActionRailController()
</script>

<template>
  <div
    v-if="railAsColumn"
    :class="
      cn(
        'studio-action-rail ginko:flex ginko:h-full ginko:min-h-0 ginko:min-w-0 ginko:flex-col ginko:bg-card',
        !open && 'studio-action-rail--collapsed',
        $props.class,
      )
    "
  >
    <div class="studio-action-rail__header">
      <div v-if="open" class="ginko:min-w-0">
        <slot name="header">
          <div class="studio-text-eyebrow ginko:truncate ginko:text-muted-foreground/70">
            {{ title }}
          </div>
        </slot>
      </div>
      <StudioActionRailToggle class="ginko:shrink-0" />
    </div>

    <template v-if="open">
      <ScrollArea class="ginko:min-h-0 ginko:flex-1">
        <div class="studio-action-rail__body">
          <slot />
        </div>
      </ScrollArea>
      <div v-if="slots.actions" class="studio-action-rail__actions">
        <slot name="actions" />
      </div>
    </template>
    <div v-else class="studio-action-rail__collapsed">
      <slot name="collapsed">
        <div class="studio-action-rail__collapsed-dot">S</div>
        <div class="studio-action-rail__collapsed-dot">P</div>
        <div class="studio-action-rail__collapsed-dot">T</div>
      </slot>
    </div>
  </div>

  <Sheet :open="showSheet" @update:open="setSheetOpen">
    <SheetContent
      class="ginko:w-[min(calc(100vw_-_1rem),22rem)] ginko:gap-0 ginko:overflow-hidden ginko:bg-card ginko:p-0 ginko:sm:max-w-md"
      side="right"
    >
      <SheetHeader class="ginko:sr-only">
        <SheetTitle>{{ sheetTitle }}</SheetTitle>
        <SheetDescription>{{ sheetDescription }}</SheetDescription>
      </SheetHeader>
      <div class="studio-action-rail ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col">
        <div class="studio-action-rail__header">
          <slot name="header">
            <div class="studio-text-eyebrow ginko:truncate ginko:text-muted-foreground/70">
              {{ title }}
            </div>
          </slot>
        </div>
        <ScrollArea class="ginko:min-h-0 ginko:flex-1">
          <div class="studio-action-rail__body">
            <slot />
          </div>
        </ScrollArea>
        <div v-if="slots.actions" class="studio-action-rail__actions">
          <slot name="actions" />
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<style scoped>
.studio-action-rail__header {
  display: flex;
  min-height: var(--studio-shell-header-height);
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  border-bottom: 1px solid var(--studio-divider);
  padding: 0 var(--space-xl);
}

.studio-action-rail--collapsed .studio-action-rail__header {
  justify-content: center;
  padding-inline: var(--space-sm);
}

.studio-action-rail__body {
  min-width: 0;
  padding-inline: var(--space-xl);
}

.studio-action-rail__actions {
  display: grid;
  flex: 0 0 auto;
  gap: var(--space-sm);
  border-top: 1px solid var(--studio-divider);
  background: var(--card);
  padding: var(--space-md) var(--space-xl);
}

.studio-action-rail__collapsed {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-sm);
}

.studio-action-rail__collapsed-dot,
:slotted(.studio-action-rail__collapsed-dot) {
  display: grid;
  width: 2.125rem;
  height: 2.125rem;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: var(--studio-panel);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
