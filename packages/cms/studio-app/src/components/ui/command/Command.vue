<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ListboxRootEmits, ListboxRootProps } from 'reka-ui'
import { ListboxRoot, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<ListboxRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<ListboxRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ListboxRoot
    data-slot="command"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:flex ginko:h-full ginko:w-full ginko:flex-col ginko:overflow-hidden ginko:rounded-md ginko:bg-popover ginko:text-popover-foreground',
        props.class,
      )
    "
  >
    <slot />
  </ListboxRoot>
</template>
