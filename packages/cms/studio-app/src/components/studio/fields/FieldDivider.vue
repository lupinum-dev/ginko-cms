<script setup lang="ts">
import type { FieldDefinition } from './useFieldCommon'

defineProps<{
  field: FieldDefinition
  modelValue: unknown
  label: string
  fieldError: string | null
}>()
</script>

<template>
  <Separator class="ginko:my-4" />
</template>
