<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Label } from '../label'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Label
    data-slot="field-label"
    :class="
      cn(
        'ginko:group/field-label ginko:peer/field-label ginko:flex ginko:w-fit ginko:gap-2 ginko:leading-snug ginko:group-data-[disabled=true]/field:opacity-50',
        'ginko:has-[>[data-slot=field]]:w-full ginko:has-[>[data-slot=field]]:flex-col ginko:has-[>[data-slot=field]]:rounded-md ginko:has-[>[data-slot=field]]:border ginko:[&>*]:data-[slot=field]:p-4',
        'ginko:has-data-[state=checked]:bg-primary/5 ginko:has-data-[state=checked]:border-primary ginko:dark:has-data-[state=checked]:bg-primary/10',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
