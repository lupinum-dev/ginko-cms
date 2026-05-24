<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { DialogTitleProps } from 'reka-ui'
import { DialogTitle } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    :class="
      cn('ginko:text-lg ginko:font-semibold ginko:leading-none ginko:tracking-tight', props.class)
    "
    v-bind="delegatedProps"
  >
    <slot />
  </DialogTitle>
</template>
