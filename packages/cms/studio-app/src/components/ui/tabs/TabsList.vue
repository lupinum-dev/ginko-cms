<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { TabsListProps } from 'reka-ui'
import { TabsList } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:bg-muted ginko:text-muted-foreground ginko:inline-flex ginko:h-9 ginko:w-fit ginko:items-center ginko:justify-center ginko:rounded-lg ginko:p-[3px]',
        props.class,
      )
    "
  >
    <slot />
  </TabsList>
</template>
