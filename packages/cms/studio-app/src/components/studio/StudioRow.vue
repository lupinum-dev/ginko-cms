<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, useSlots } from 'vue'

import { cn } from '../ui/utils'

const props = withDefaults(
  defineProps<{
    as?: 'div' | 'a' | 'button' | 'li'
    href?: string
    to?: string
    density?: 'default' | 'compact'
    variant?: 'default' | 'outline'
    interactive?: boolean
    active?: boolean
    disabled?: boolean
    class?: HTMLAttributes['class']
  }>(),
  {
    as: 'div',
    href: undefined,
    to: undefined,
    density: 'default',
    variant: 'default',
    interactive: false,
    active: false,
    disabled: false,
    class: undefined,
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const slots = useSlots()
const computedAs = computed(() => {
  if (props.as) return props.as
  if (props.to) return 'router-link'
  if (props.href) return 'a'
  if (props.interactive) return 'button'
  return 'div'
})

const containerClass = computed(() =>
  cn(
    'studio-row ginko:group/studio-row ginko:relative ginko:flex ginko:w-full ginko:min-w-0 ginko:items-center ginko:gap-3 ginko:text-left',
    props.density === 'compact'
      ? 'ginko:h-8 ginko:gap-2 ginko:px-2 ginko:py-1.5'
      : 'ginko:min-h-10 ginko:gap-3 ginko:px-3 ginko:py-2',
    props.variant === 'outline' &&
      'ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-card',
    props.variant === 'default' && 'ginko:rounded-md',
    (props.interactive || props.href || props.to) &&
      'studio-motion-fast ginko:hover:bg-muted/40 ginko:focus-visible:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring/40 ginko:focus-visible:ring-offset-1',
    props.active && 'ginko:bg-muted/60 ginko:text-foreground',
    props.disabled && 'ginko:pointer-events-none ginko:opacity-50',
    props.class,
  ),
)

const titleSize = computed(() =>
  props.density === 'compact' ? 'ginko:text-[12px]' : 'ginko:text-[13px]',
)
</script>

<template>
  <component
    :is="computedAs"
    :href="href"
    :to="to"
    :type="computedAs === 'button' ? 'button' : undefined"
    :class="containerClass"
    @click="(e: MouseEvent) => emit('click', e)"
  >
    <span
      v-if="slots.icon"
      class="ginko:flex ginko:shrink-0 ginko:items-center ginko:justify-center ginko:text-muted-foreground/70 ginko:[&>svg]:size-4"
    >
      <slot name="icon" />
    </span>

    <span class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:flex-col ginko:gap-0.5">
      <span
        v-if="slots.title"
        :class="['ginko:truncate ginko:font-medium ginko:text-foreground', titleSize]"
      >
        <slot name="title" />
      </span>
      <span
        v-if="slots.description"
        class="ginko:truncate ginko:text-[12px] ginko:leading-snug ginko:text-muted-foreground/80"
      >
        <slot name="description" />
      </span>
      <slot />
    </span>

    <span
      v-if="slots.meta"
      class="ginko:shrink-0 ginko:text-[11px] ginko:tabular-nums ginko:text-muted-foreground/70"
    >
      <slot name="meta" />
    </span>

    <span v-if="slots.actions" class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-1">
      <slot name="actions" />
    </span>
  </component>
</template>
