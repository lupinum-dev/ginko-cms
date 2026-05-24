<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { AvatarFallbackProps } from 'reka-ui'
import { AvatarFallback } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<AvatarFallbackProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AvatarFallback
    data-slot="avatar-fallback"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:bg-muted ginko:flex ginko:size-full ginko:items-center ginko:justify-center ginko:rounded-full',
        props.class,
      )
    "
  >
    <slot />
  </AvatarFallback>
</template>
