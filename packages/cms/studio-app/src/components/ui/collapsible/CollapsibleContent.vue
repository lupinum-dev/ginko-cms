<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { CollapsibleContentProps } from 'reka-ui'
import { CollapsibleContent } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<CollapsibleContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <CollapsibleContent
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:overflow-hidden ginko:data-[state=closed]:animate-collapsible-up ginko:data-[state=open]:animate-collapsible-down',
        props.class,
      )
    "
  >
    <slot />
  </CollapsibleContent>
</template>
