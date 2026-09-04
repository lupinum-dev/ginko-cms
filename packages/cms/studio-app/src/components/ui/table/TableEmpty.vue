<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'
import TableCell from './TableCell.vue'
import TableRow from './TableRow.vue'

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    colspan?: number
  }>(),
  {
    colspan: 1,
  },
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <TableRow>
    <TableCell
      :class="
        cn(
          'ginko:p-4 ginko:whitespace-nowrap ginko:align-middle ginko:text-sm ginko:text-foreground',
          props.class,
        )
      "
      v-bind="delegatedProps"
    >
      <div class="ginko:flex ginko:items-center ginko:justify-center ginko:py-10">
        <slot />
      </div>
    </TableCell>
  </TableRow>
</template>
