<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { LabelProps } from 'reka-ui'
import { Label } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Label
    data-slot="label"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm ginko:leading-none ginko:font-medium ginko:select-none ginko:group-data-[disabled=true]:pointer-events-none ginko:group-data-[disabled=true]:opacity-50 ginko:peer-disabled:cursor-not-allowed ginko:peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
