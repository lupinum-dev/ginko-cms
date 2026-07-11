<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'

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
      <Eye v-if="showPassword" class="size-4" aria-hidden="true" />
      <EyeOff v-else class="size-4" aria-hidden="true" />
      <span class="sr-only">
        {{ showPassword ? 'Show password' : 'Hide password' }}
      </span>
    </button>
  </div>
</template>
