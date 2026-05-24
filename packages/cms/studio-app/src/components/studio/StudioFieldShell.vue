<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  class?: HTMLAttributes['class']
  description?: string
  error?: string | null
  for?: string
  label: string
  optional?: boolean
  required?: boolean
}>()
</script>

<template>
  <div :class="cn('ginko:space-y-1.5', $props.class)">
    <div class="ginko:flex ginko:min-h-5 ginko:items-center ginko:justify-between ginko:gap-3">
      <Label
        :for="$props.for"
        class="ginko:min-w-0 ginko:text-[13px] ginko:font-medium ginko:text-foreground"
      >
        <span class="ginko:truncate">{{ label }}</span>
        <span v-if="required" class="ginko:ml-1 ginko:text-destructive">*</span>
        <span
          v-else-if="optional"
          class="ginko:ml-1 ginko:text-xs ginko:font-normal ginko:text-muted-foreground"
        >
          Optional
        </span>
      </Label>
      <slot name="action" />
    </div>
    <slot />
    <p v-if="error" class="ginko:text-[12px] ginko:leading-snug ginko:text-destructive-fg">
      {{ error }}
    </p>
    <p
      v-else-if="description"
      class="ginko:text-[12px] ginko:leading-snug ginko:text-muted-foreground/80"
    >
      {{ description }}
    </p>
  </div>
</template>
