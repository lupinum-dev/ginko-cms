<script setup lang="ts">
import type { SelectLabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { SelectLabel } from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  SelectLabelProps & { class?: HTMLAttributes['class'] }
>()
</script>

<template>
  <SelectLabel
    data-slot="select-label"
    :class="cn('ginko:text-muted-foreground ginko:px-2 ginko:py-1.5 ginko:text-xs', props.class)"
  >
    <slot />
  </SelectLabel>
</template>
