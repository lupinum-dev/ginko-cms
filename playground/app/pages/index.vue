<template>
  <div class="max-w-2xl mx-auto p-8">
    <h1 class="text-3xl font-bold mb-4">Trellis CMS Playground</h1>
    <p class="text-gray-600 mb-6">
      This playground demonstrates the self-hosted CMS module powered by Trellis
      and Convex.
    </p>
    <div class="flex gap-4">
      <NuxtLink
        to="/blog"
        class="px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
      >
        View Blog
      </NuxtLink>
      <NuxtLink
        to="/studio"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Open Studio
      </NuxtLink>
    </div>
  </div>
</template>
