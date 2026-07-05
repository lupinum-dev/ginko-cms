<script setup lang="ts">
import { Loader2, Upload } from 'lucide-vue-next'
import { ref } from 'vue'

const browserRef = ref<{
  uploadInput?: HTMLInputElement | null
  uploading?: boolean
} | null>(null)
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader title="Media" eyebrow="Editor">
        <template #actions>
          <Button
            size="sm"
            :disabled="browserRef?.uploading"
            @click="browserRef?.uploadInput?.click()"
          >
            <Loader2
              v-if="browserRef?.uploading"
              class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
            />
            <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
            Upload
          </Button>
        </template>
      </StudioPageHeader>
    </template>
    <StudioAssetBrowser
      ref="browserRef"
      mode="manage"
      embedded
      class="studio-page-content ginko:h-full"
    />
  </StudioWorkspace>
</template>
