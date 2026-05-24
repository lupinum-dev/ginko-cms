<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'

import type { AlertVariants } from '../ui/alert'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const props = withDefaults(
  defineProps<{
    tone?: NoticeTone
    title?: string
    description?: string
    class?: string
  }>(),
  {
    tone: 'info',
    title: undefined,
    description: undefined,
    class: undefined,
  },
)

const variant = computed<AlertVariants['variant']>(() => {
  switch (props.tone) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'destructive'
    case 'neutral':
      return 'default'
    default:
      return 'info'
  }
})

const icon = computed(() => {
  switch (props.tone) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return TriangleAlert
    case 'danger':
      return AlertCircle
    default:
      return Info
  }
})
</script>

<template>
  <Alert :variant="variant" :class="props.class">
    <component :is="icon" aria-hidden="true" />
    <AlertTitle v-if="title">
      {{ title }}
    </AlertTitle>
    <AlertDescription v-if="description || $slots.default || $slots.action">
      <p v-if="description">
        {{ description }}
      </p>
      <slot />
      <div v-if="$slots.action" class="ginko:mt-2">
        <slot name="action" />
      </div>
    </AlertDescription>
  </Alert>
</template>
