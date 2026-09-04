<template>
  <div class="max-w-2xl mx-auto p-8">
    <h1 class="text-3xl font-bold mb-6">Blog</h1>

    <div v-if="pending" class="text-gray-500">Loading posts...</div>

    <div v-else-if="loadError" class="text-red-600">
      Published posts are temporarily unavailable.
    </div>

    <div v-else-if="blogPosts.length === 0" class="text-gray-500">
      No published posts yet.
      <NuxtLink to="/studio/blog/new" class="text-blue-600 hover:underline">
        Create one in Studio
      </NuxtLink>
    </div>

    <div v-else class="space-y-6">
      <article v-for="post in blogPosts" :key="post.id" class="border-b pb-6 last:border-0">
        <NuxtLink :to="post.route.resolvedPath" class="block group">
          <h2 class="text-xl font-semibold group-hover:text-blue-600">
            {{ post.title }}
          </h2>
          <p v-if="post.description" class="text-gray-600 mt-1">
            {{ post.description }}
          </p>
        </NuxtLink>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { paginate } from '@lupinum/ginko-content/client'
import { computed } from 'vue'

const {
  data: posts,
  pending,
  error: loadError,
} = await useAsyncData('blog-posts', () => {
  return paginate('blog', {
    mode: 'cursor',
    locale: 'en',
    limit: 50,
  })
})

if (import.meta.server && loadError.value) {
  throwPublicContentFailure(loadError.value, 'Published posts are temporarily unavailable.')
}

const blogPosts = computed(() => posts.value?.data ?? [])
</script>
