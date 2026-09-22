<script setup lang="ts">
import { landing_content } from '../../utils/landingContent'

const { page, status, error } = await useContentPage('landing')
useCmsSeoAlternates(page)
useSeoMeta({
  title: () => (typeof page.value?.title === 'string' ? page.value.title : 'Fieldnotes'),
  description: () =>
    typeof page.value?.description === 'string' ? page.value.description : undefined,
})

if (import.meta.server) {
  throwPublicContentFailure(error.value, 'This page is temporarily unavailable.')
  await redirectPublicContentAlias(page.value)
  if (!page.value) setResponseStatus(404)
}
</script>

<template>
  <LandingPage v-if="page" :content="landing_content(page)" />
  <div v-else class="max-w-2xl mx-auto p-8" role="status">
    {{
      status === 'pending'
        ? 'Loading…'
        : error
          ? 'This page is temporarily unavailable.'
          : 'Page not found.'
    }}
  </div>
</template>
