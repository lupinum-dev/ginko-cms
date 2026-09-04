<script setup lang="ts">
import StudioGlobalConfirm from './components/studio/StudioGlobalConfirm.vue'
import StudioGlobalPrompt from './components/studio/StudioGlobalPrompt.vue'
import Layout from './Layout.vue'
</script>

<template>
  <Layout>
    <!-- Opacity-only page crossfade (W-DM): translate would fight the
         fixed-pane scroll model, `appear` would flash on first paint. The
         shell (Layout) stays mounted, only the page content fades. -->
    <RouterView v-slot="{ Component }">
      <Transition name="studio-page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </Layout>
  <StudioGlobalConfirm />
  <StudioGlobalPrompt />
</template>

<style>
.studio-page-enter-active,
.studio-page-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease-soft);
}
.studio-page-enter-from,
.studio-page-leave-to {
  opacity: 0;
}
</style>
