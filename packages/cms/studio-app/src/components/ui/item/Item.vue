<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import type { ItemVariants } from '.'
import { itemVariants } from '.'
import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      class?: HTMLAttributes['class']
      size?: ItemVariants['size']
      variant?: ItemVariants['variant']
    }
  >(),
  { as: 'div' },
)
</script>

<template>
  <Primitive
    data-slot="item"
    :data-size="size ?? 'default'"
    :data-variant="variant ?? 'default'"
    :as="as"
    :as-child="asChild"
    :class="cn(itemVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
