<template>
  <div class="max-w-2xl mx-auto p-8">
    <NuxtLink
      to="/blog"
      class="text-sm text-gray-400 hover:text-gray-600 mb-4 block"
    >
      &larr; Back to blog
    </NuxtLink>

    <div v-if="pending" class="text-gray-500">Loading...</div>

    <article v-else-if="post" class="prose dark:prose-invert max-w-none">
      <h1>{{ post.title }}</h1>
      <p v-if="post.data.description" class="text-gray-500 text-lg">
        {{ post.data.description }}
      </p>
      <NuxtTime
        v-if="post.publishedAt"
        :datetime="post.publishedAt"
        locale="en-US"
        year="numeric"
        month="short"
        day="numeric"
        class="text-sm text-gray-400 block mb-8"
      />

      <!-- Render MDC content -->
      <MDC v-if="post.data.bodyMdc" :value="post.data.bodyMdc" />
      <div v-else-if="post.data.bodyMdc === ''" class="text-gray-400 italic">
        No content.
      </div>
    </article>

    <div v-else class="text-gray-500">Post not found.</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug
const result = await useFetch('/api/ginko/v1/page', {
  query: { collection: 'blog', path: `/blog/${slug || ''}` },
})
const pending = result.pending
const post = computed(() => result.data.value?.status === 'found' ? result.data.value.page : null)
</script>
