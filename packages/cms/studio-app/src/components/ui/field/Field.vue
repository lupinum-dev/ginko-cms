<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      class?: HTMLAttributes['class']
      disabled?: boolean
      invalid?: boolean
      orientation?: 'vertical' | 'horizontal'
    }
  >(),
  {
    as: 'div',
    disabled: false,
    invalid: false,
    orientation: 'vertical',
  },
)
</script>

<template>
  <Primitive
    data-slot="field"
    :data-disabled="disabled ? true : undefined"
    :data-invalid="invalid ? true : undefined"
    :data-orientation="orientation"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'ginko:data-[invalid=true]:text-destructive ginko:group/field ginko:flex ginko:w-full',
        orientation === 'horizontal'
          ? 'ginko:flex-row ginko:items-center ginko:gap-2'
          : 'ginko:flex-col ginko:gap-2',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
