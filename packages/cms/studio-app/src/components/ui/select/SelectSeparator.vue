<script setup lang="ts">
import type { SelectSeparatorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectSeparator } from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  SelectSeparatorProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <SelectSeparator
    data-slot="select-separator"
    v-bind="delegatedProps"
    :class="cn('ginko:bg-border ginko:pointer-events-none ginko:-mx-1 ginko:my-1 ginko:h-px', props.class)"
  />
</template>
