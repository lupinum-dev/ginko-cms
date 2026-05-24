<template>
  <div class="max-w-2xl mx-auto p-8">
    <h1 class="text-3xl font-bold mb-6">Blog</h1>

    <div v-if="pending" class="text-gray-500">Loading posts...</div>

    <div v-else-if="blogPosts.length === 0" class="text-gray-500">
      No published posts yet.
      <NuxtLink to="/studio/blog/new" class="text-blue-600 hover:underline">
        Create one in Studio
      </NuxtLink>
    </div>

    <div v-else class="space-y-6">
      <article v-for="post in blogPosts" :key="post.id" class="border-b pb-6 last:border-0">
        <NuxtLink :to="post.route.href ?? post.route.path" class="block group">
          <h2 class="text-xl font-semibold group-hover:text-blue-600">
            {{ post.title }}
          </h2>
          <p v-if="post.data.description" class="text-gray-600 mt-1">
            {{ post.data.description }}
          </p>
          <NuxtTime
            v-if="post.publishedAt"
            :datetime="post.publishedAt"
            locale="en-US"
            year="numeric"
            month="short"
            day="numeric"
            class="text-sm text-gray-400 mt-2 block"
          />
        </NuxtLink>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const posts = await useFetch('/api/ginko/v1/list', {
  query: { collection: 'blog', limit: 50 },
})
const pending = computed(() => posts.pending.value)
const blogPosts = computed(() => posts.data.value?.entries ?? [])
</script>
