<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <fieldset
    data-slot="field-set"
    :class="
      cn(
        'ginko:flex ginko:flex-col ginko:gap-6',
        'ginko:has-[>[data-slot=checkbox-group]]:gap-3 ginko:has-[>[data-slot=radio-group]]:gap-3',
        props.class,
      )
    "
  >
    <slot />
  </fieldset>
</template>
