<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { SeparatorProps } from 'reka-ui'
import { Separator } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<SeparatorProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Separator
    data-slot="command-separator"
    v-bind="delegatedProps"
    :class="cn('ginko:bg-border ginko:-mx-1 ginko:h-px', props.class)"
  >
    <slot />
  </Separator>
</template>
