<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ListboxGroupProps } from 'reka-ui'
import { ListboxGroup, ListboxGroupLabel, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<
  ListboxGroupProps & {
    class?: HTMLAttributes['class']
    heading?: string
  }
>()
const delegatedProps = reactiveOmit(props, 'class', 'heading')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ListboxGroup
    data-slot="command-group"
    v-bind="forwarded"
    :class="cn('ginko:overflow-hidden ginko:p-1 ginko:text-foreground', props.class)"
  >
    <ListboxGroupLabel
      v-if="heading"
      class="ginko:px-2 ginko:py-1.5 ginko:text-xs ginko:font-medium ginko:text-muted-foreground"
    >
      {{ heading }}
    </ListboxGroupLabel>
    <slot />
  </ListboxGroup>
</template>
