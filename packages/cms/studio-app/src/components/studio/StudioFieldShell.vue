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
  <Field :invalid="Boolean(error)" :class="cn('ginko:gap-2', $props.class)">
    <div class="ginko:flex ginko:min-h-6 ginko:items-center ginko:justify-between ginko:gap-3">
      <FieldLabel
        :for="$props.for"
        class="ginko:min-w-0 ginko:text-sm ginko:font-medium ginko:text-foreground"
      >
        <span class="ginko:truncate">{{ label }}</span>
        <span v-if="required" class="ginko:ml-1 ginko:text-destructive">*</span>
        <span
          v-else-if="optional"
          class="ginko:ml-1 ginko:text-xs ginko:font-normal ginko:text-muted-foreground"
        >
          Optional
        </span>
      </FieldLabel>
      <slot name="action" />
    </div>
    <slot />
    <FieldError v-if="error" class="ginko:leading-snug">
      {{ error }}
    </FieldError>
    <FieldDescription
      v-else-if="description"
      class="ginko:leading-snug ginko:text-muted-foreground/80"
    >
      {{ description }}
    </FieldDescription>
  </Field>
</template>
