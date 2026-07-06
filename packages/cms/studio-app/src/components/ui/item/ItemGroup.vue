<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(defineProps<PrimitiveProps & { class?: HTMLAttributes['class'] }>(), {
  as: 'div',
})
</script>

<template>
  <Primitive
    data-slot="item-group"
    :as="as"
    :as-child="asChild"
    :class="cn('ginko:group/item-group ginko:flex ginko:w-full ginko:flex-col', props.class)"
  >
    <slot />
  </Primitive>
</template>
