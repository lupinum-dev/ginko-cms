<script setup lang="ts">
import { SearchX } from '@lucide/vue'

import { useCmsI18n } from '../composables/useCmsI18n'

// Catch-all target for unknown Studio URLs (stale bookmarks, mistyped paths):
// a visible dead end with an exit back to the work queue instead of the blank
// canvas the router used to render for unmatched routes.
const { t } = useCmsI18n()
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <ScrollArea class="ginko:flex-1">
      <StudioPageBody>
        <StudioEmptyState
          :title="t('ginkoCms.studio.notFoundPage.title')"
          :description="t('ginkoCms.studio.notFoundPage.description')"
        >
          <template #icon>
            <SearchX class="ginko:size-5" aria-hidden="true" />
          </template>
          <template #action>
            <Button as-child size="sm">
              <RouterLink to="/">
                {{ t('ginkoCms.studio.notFoundPage.cta') }}
              </RouterLink>
            </Button>
          </template>
        </StudioEmptyState>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
