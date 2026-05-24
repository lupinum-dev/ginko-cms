<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { SeparatorProps } from 'reka-ui'
import { Separator } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(defineProps<SeparatorProps & { class?: HTMLAttributes['class'] }>(), {
  orientation: 'horizontal',
  decorative: true,
})

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Separator
    data-slot="separator"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:bg-border ginko:shrink-0 ginko:data-[orientation=horizontal]:h-px ginko:data-[orientation=horizontal]:w-full ginko:data-[orientation=vertical]:h-full ginko:data-[orientation=vertical]:w-px',
        props.class,
      )
    "
  />
</template>
