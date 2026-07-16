<template>
  <div class="max-w-2xl mx-auto p-8">
    <NuxtLink to="/" class="text-sm text-gray-400 hover:text-gray-600 mb-4 block">
      &larr; Home
    </NuxtLink>

    <div v-if="pending" class="text-gray-500">Loading...</div>

    <article v-else-if="page" class="prose dark:prose-invert max-w-none">
      <h1>{{ page.title }}</h1>
      <p v-if="page.description" class="text-gray-500 text-lg">
        {{ page.description }}
      </p>

      <ContentRenderer :value="page">
        <template #empty>
          <div class="text-gray-400 italic">No content.</div>
        </template>
      </ContentRenderer>
    </article>

    <div v-else class="text-gray-500">Page not found.</div>
  </div>
</template>

<script setup lang="ts">
const { page, status } = await useContentPage('docs')
const pending = computed(() => status.value === 'pending')

if (import.meta.server && !page.value) {
  setResponseStatus(404)
}
</script>
