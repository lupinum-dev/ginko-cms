<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ListboxItemEmits, ListboxItemProps } from 'reka-ui'
import { ListboxItem, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<ListboxItemProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ListboxItemEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ListboxItem
    data-slot="command-item"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:relative ginko:flex ginko:cursor-default ginko:items-center ginko:gap-2 ginko:rounded-sm ginko:px-2 ginko:py-1.5 ginko:text-sm ginko:outline-hidden ginko:select-none ginko:data-[highlighted]:bg-accent ginko:data-[highlighted]:text-accent-foreground ginko:data-[disabled]:pointer-events-none ginko:data-[disabled]:opacity-50 ginko:[&_svg:not([class*=\'size-\'])]:size-4 ginko:[&_svg]:shrink-0',
        props.class,
      )
    "
  >
    <slot />
  </ListboxItem>
</template>
