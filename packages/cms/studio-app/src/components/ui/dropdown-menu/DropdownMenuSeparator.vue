<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { DropdownMenuSeparatorProps } from 'reka-ui'
import { DropdownMenuSeparator } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<
  DropdownMenuSeparatorProps & {
    class?: HTMLAttributes['class']
  }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DropdownMenuSeparator
    data-slot="dropdown-menu-separator"
    v-bind="delegatedProps"
    :class="cn('ginko:bg-border ginko:-mx-1 ginko:my-1 ginko:h-px', props.class)"
  />
</template>
