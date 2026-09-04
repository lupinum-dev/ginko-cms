<script setup lang="ts">
import {
  BookOpen,
  FileText,
  Files,
  GitCommitHorizontal,
  History,
  House,
  Newspaper,
  Scale,
  Users,
} from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  icon?: string | null
  slug?: string | null
}>()

const fallbackIcons: Record<string, string> = {
  authors: 'users',
  blog: 'newspaper',
  changelog: 'history',
  docs: 'book-open',
  index: 'house',
  posts: 'files',
  pricing: 'scale',
  versions: 'git-commit-horizontal',
}

const iconComponents = {
  'book-open': BookOpen,
  file: FileText,
  'file-text': FileText,
  files: Files,
  'git-commit-horizontal': GitCommitHorizontal,
  history: History,
  house: House,
  newspaper: Newspaper,
  scale: Scale,
  users: Users,
}

const normalizedIcon = computed(() => {
  const configuredIcon = props.icon?.trim()
  return configuredIcon || fallbackIcons[props.slug ?? ''] || 'file-text'
})

const lucideKey = computed(() => normalizedIcon.value.replace(/^lucide:/, ''))
const component = computed(
  () => iconComponents[lucideKey.value as keyof typeof iconComponents] ?? null,
)
const iconName = computed(() => {
  const icon = normalizedIcon.value
  return icon.includes(':') ? icon : `lucide:${icon}`
})
</script>

<template>
  <component :is="component" v-if="component" aria-hidden="true" />
  <Icon v-else :name="iconName" aria-hidden="true" />
</template>
