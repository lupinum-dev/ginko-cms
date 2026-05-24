<script setup lang="ts">
import StudioGlobalConfirm from './components/studio/StudioGlobalConfirm.vue'
import StudioGlobalPrompt from './components/studio/StudioGlobalPrompt.vue'
import Layout from './Layout.vue'
</script>

<template>
  <Layout>
    <RouterView />
  </Layout>
  <StudioGlobalConfirm />
  <StudioGlobalPrompt />
</template>
