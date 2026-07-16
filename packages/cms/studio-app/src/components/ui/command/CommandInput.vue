<script setup lang="ts">
import { Search } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import type { ListboxFilterProps } from 'reka-ui'
import { ListboxFilter, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { useCommand } from '.'
import { cn } from '../utils'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<
  ListboxFilterProps & {
    class?: HTMLAttributes['class']
  }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)

const { filterState } = useCommand()
</script>

<template>
  <div
    data-slot="command-input-wrapper"
    class="ginko:flex ginko:h-12 ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3"
  >
    <Search class="ginko:size-4 ginko:shrink-0 ginko:opacity-50" />
    <ListboxFilter
      v-bind="{ ...forwardedProps, ...$attrs }"
      v-model="filterState.search"
      data-slot="command-input"
      auto-focus
      :class="
        cn(
          'ginko:placeholder:text-muted-foreground ginko:flex ginko:h-12 ginko:w-full ginko:rounded-md ginko:bg-transparent ginko:py-3 ginko:text-sm ginko:outline-hidden ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50',
          props.class,
        )
      "
    />
  </div>
</template>
