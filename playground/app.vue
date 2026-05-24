<template>
  <div>
    <nav class="border-b px-6 py-3 flex gap-4 text-sm">
      <NuxtLink to="/" class="hover:text-blue-600">Home</NuxtLink>
      <NuxtLink to="/blog" class="hover:text-blue-600">Blog</NuxtLink>
      <NuxtLink to="/studio" class="hover:text-blue-600 ml-auto font-medium"
        >Studio</NuxtLink
      >
    </nav>
    <NuxtPage />
  </div>
</template>
