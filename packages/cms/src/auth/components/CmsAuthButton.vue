<script setup lang="ts">
import { computed } from '#imports'

const props = withDefaults(
  defineProps<{
    class?: string
    variant?: 'default' | 'ghost'
    size?: 'default' | 'sm'
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    type: 'button',
    variant: 'default',
    size: 'default',
  },
)

const buttonClass = computed(() => [
  'cms-auth-button',
  props.variant === 'ghost' ? 'cms-auth-button--ghost' : '',
  props.size === 'sm' ? 'cms-auth-button--sm' : '',
  props.class,
])
</script>

<template>
  <button data-slot="button" :type="type" :class="buttonClass">
    <slot />
  </button>
</template>
