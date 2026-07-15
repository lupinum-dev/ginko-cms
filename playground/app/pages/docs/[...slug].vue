<template>
  <div class="max-w-2xl mx-auto p-8">
    <NuxtLink
      to="/"
      class="text-sm text-gray-400 hover:text-gray-600 mb-4 block"
    >
      &larr; Home
    </NuxtLink>

    <div v-if="pending" class="text-gray-500">Loading...</div>

    <article v-else-if="page" class="prose dark:prose-invert max-w-none">
      <h1>{{ page.title }}</h1>
      <p v-if="page.data.description" class="text-gray-500 text-lg">
        {{ page.data.description }}
      </p>

      <MDC v-if="page.data.bodyMdc" :value="page.data.bodyMdc" />
      <div v-else-if="page.data.bodyMdc === ''" class="text-gray-400 italic">
        No content.
      </div>
    </article>

    <div v-else class="text-gray-500">Page not found.</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug
const result = await useFetch('/api/ginko/v1/page', {
  query: { collection: 'docs', path: `/docs/${slug || ''}` },
})
const pending = result.pending
const page = computed(() => (result.data.value?.status === 'found' ? result.data.value.page : null))
</script>
