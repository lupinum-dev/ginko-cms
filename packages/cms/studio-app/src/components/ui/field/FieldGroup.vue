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
    data-slot="field-group"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'ginko:group/field-group ginko:@container/field-group ginko:flex ginko:w-full ginko:flex-col ginko:gap-5',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
