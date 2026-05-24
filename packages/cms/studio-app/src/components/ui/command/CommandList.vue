<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ListboxContentProps } from 'reka-ui'
import { ListboxContent, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<ListboxContentProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ListboxContent
    data-slot="command-list"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:max-h-[300px] ginko:scroll-py-1 ginko:overflow-x-hidden ginko:overflow-y-auto ginko:py-1',
        props.class,
      )
    "
  >
    <slot />
  </ListboxContent>
</template>
