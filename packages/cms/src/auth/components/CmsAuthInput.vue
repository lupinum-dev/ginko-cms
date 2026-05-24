<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { computed } from '#imports'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const modelValue = defineModel<string | number>()

const inputClass = computed(() => ['cms-auth-input', props.class])
</script>

<template>
  <input v-model="modelValue" data-slot="input" :class="inputClass" />
</template>
