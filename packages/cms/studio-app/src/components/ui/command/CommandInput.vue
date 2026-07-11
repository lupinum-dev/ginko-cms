<script setup lang="ts">
import { Search } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { ListboxFilter, useForwardProps } from 'reka-ui'
import type { ListboxFilterProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<
  ListboxFilterProps & {
    class?: HTMLAttributes['class']
    placeholder?: string
  }
>()
const delegatedProps = reactiveOmit(props, 'class', 'placeholder')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <div
    data-slot="command-input-wrapper"
    class="ginko:flex ginko:h-12 ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3"
  >
    <Search class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
    <ListboxFilter
      data-slot="command-input"
      v-bind="forwarded"
      auto-focus
      :placeholder="placeholder"
      :class="
        cn(
          'ginko:flex ginko:h-10 ginko:w-full ginko:rounded-md ginko:bg-transparent ginko:py-3 ginko:text-sm ginko:outline-hidden ginko:placeholder:text-muted-foreground ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50',
          props.class,
        )
      "
    />
  </div>
</template>
