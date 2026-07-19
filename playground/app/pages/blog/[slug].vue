<template>
  <div class="max-w-2xl mx-auto p-8">
    <NuxtLink to="/blog" class="text-sm text-gray-400 hover:text-gray-600 mb-4 block">
      &larr; Back to blog
    </NuxtLink>

    <div v-if="pending" class="text-gray-500">Loading...</div>

    <div v-else-if="loadError" class="text-red-600">This post is temporarily unavailable.</div>

    <article v-else-if="post" class="prose dark:prose-invert max-w-none">
      <h1>{{ post.title }}</h1>
      <p v-if="post.description" class="text-gray-500 text-lg">
        {{ post.description }}
      </p>
      <ContentRenderer :value="post">
        <template #empty>
          <div class="text-gray-400 italic">No content.</div>
        </template>
      </ContentRenderer>
    </article>

    <div v-else class="text-gray-500">Post not found.</div>
  </div>
</template>

<script setup lang="ts">
const { page: post, status, error: loadError } = await useContentPage('blog')
const pending = computed(() => status.value === 'pending')

useCmsSeoAlternates(post)

if (import.meta.server) {
  throwPublicContentFailure(loadError.value, 'This post is temporarily unavailable.')
  if (
    post.value?.route.requestedPath &&
    post.value.route.resolvedPath &&
    post.value.route.requestedPath !== post.value.route.resolvedPath
  ) {
    await navigateTo(post.value.route.resolvedPath, { redirectCode: 308, replace: true })
  }
  if (!post.value) setResponseStatus(404)
}
</script>
