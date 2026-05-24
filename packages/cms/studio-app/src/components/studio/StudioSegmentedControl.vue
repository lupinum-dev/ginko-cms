<script setup lang="ts">
import type { Component } from 'vue'

import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { cn } from '../ui/utils'

type Segment = {
  value: string
  label: string
  icon?: Component
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string
  items: Segment[]
  ariaLabel: string
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleUpdate(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    return
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <ToggleGroup
    type="single"
    variant="outline"
    size="sm"
    :model-value="modelValue"
    :aria-label="ariaLabel"
    :class="cn(props.class)"
    @update:model-value="handleUpdate"
  >
    <ToggleGroupItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      :aria-label="item.label"
    >
      <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
      <span class="ginko:truncate">{{ item.label }}</span>
    </ToggleGroupItem>
  </ToggleGroup>
</template>
