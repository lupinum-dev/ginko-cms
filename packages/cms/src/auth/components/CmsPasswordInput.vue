<script setup lang="ts">
import { ref, useAttrs } from '#imports'

import CmsAuthInput from './CmsAuthInput.vue'

const { disabled, placeholder } = defineProps<{
  disabled?: boolean
  placeholder?: string
}>()
defineOptions({ inheritAttrs: false })
const modelValue = defineModel<string>()
const showPassword = ref(false)
const attrs = useAttrs()
</script>

<template>
  <div class="cms-auth-password">
    <CmsAuthInput
      v-model="modelValue"
      v-bind="attrs"
      :type="showPassword ? 'text' : 'password'"
      :placeholder="placeholder ?? 'Enter your password'"
      :disabled="disabled"
    />
    <button
      type="button"
      class="cms-auth-password__toggle"
      :disabled="disabled"
      @click="showPassword = !showPassword"
    >
      <svg
        v-if="showPassword"
        class="cms-auth-password__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg
        v-else
        class="cms-auth-password__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.1 3.1" />
        <path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.4" />
      </svg>
      <span class="sr-only">
        {{ showPassword ? 'Show password' : 'Hide password' }}
      </span>
    </button>
  </div>
</template>
