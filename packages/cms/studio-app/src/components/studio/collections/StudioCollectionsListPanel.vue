<script setup lang="ts">
import { Layers } from '@lucide/vue'
import { ref } from 'vue'

import StudioCollectionIcon from './StudioCollectionIcon.vue'
type CollectionListItem = {
  slug: string
  label: string
  icon?: string | null
  type?: string
  fieldCount?: number
}

defineProps<{
  collections: CollectionListItem[]
  isLoading?: boolean
  t: (key: string, params?: Record<string, unknown>) => string
}>()

const selectedCollection = defineModel<string | null>('selectedCollection', {
  required: true,
})
const lastClickedCollection = ref<string | null>(null)

function selectCollection(slug: string) {
  lastClickedCollection.value = slug
  selectedCollection.value = slug
  if (import.meta.dev) {
    console.debug('[ginko-cms] studio collection selected', {
      slug,
    })
  }
}
</script>

<template>
  <div
    class="ginko:flex ginko:w-full ginko:shrink-0 ginko:flex-col ginko:border-b ginko:bg-muted/10 ginko:lg:w-72 ginko:lg:border-b-0 ginko:lg:border-r"
  >
    <ScrollArea class="ginko:flex-1">
      <div class="ginko:p-3">
        <!-- Loading skeleton -->
        <div v-if="isLoading" class="ginko:space-y-1">
          <div
            v-for="i in 4"
            :key="`skeleton-collection-${i}`"
            class="ginko:flex ginko:items-center ginko:gap-2.5 ginko:rounded-lg ginko:px-3 ginko:py-2.5"
          >
            <Skeleton class="ginko:size-8 ginko:rounded-md ginko:shrink-0" />
            <div class="ginko:min-w-0 ginko:flex-1 ginko:space-y-1.5">
              <Skeleton class="ginko:h-3.5" :style="{ width: `${50 + ((i * 13) % 30)}%` }" />
              <Skeleton class="ginko:h-3 ginko:w-20" />
            </div>
          </div>
        </div>

        <StudioEmptyState
          v-else-if="collections.length === 0"
          :title="t('ginkoCms.studio.collectionsPage.noCollections')"
        >
          <template #icon>
            <Layers class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <div v-else class="ginko:space-y-1">
          <button
            v-for="collection in collections"
            :key="collection.slug"
            type="button"
            class="ginko:w-full ginko:flex ginko:items-center ginko:gap-2.5 ginko:rounded-lg ginko:px-3 ginko:py-2.5 ginko:text-left ginko:transition-colors ginko:hover:bg-muted/50"
            :class="
              selectedCollection === collection.slug
                ? 'ginko:bg-background ginko:ring-1 ginko:ring-border'
                : ''
            "
            :data-testid="`cms-collection-${collection.slug}`"
            :data-collection-slug="collection.slug"
            :data-last-clicked="lastClickedCollection === collection.slug ? 'true' : 'false'"
            @click="selectCollection(collection.slug)"
          >
            <div
              class="ginko:flex ginko:size-8 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:rounded-md ginko:bg-background ginko:ring-1 ginko:ring-border/70"
            >
              <StudioCollectionIcon
                :icon="collection.icon"
                :slug="collection.slug"
                class="ginko:size-4 ginko:text-muted-foreground"
              />
            </div>
            <div class="ginko:min-w-0 ginko:flex-1">
              <div class="ginko:text-sm ginko:font-medium ginko:truncate">
                {{ collection.label }}
              </div>
              <div class="ginko:text-xs ginko:text-muted-foreground ginko:truncate">
                {{
                  collection.type === 'tree'
                    ? t('ginkoCms.studio.collectionsPage.typeTree')
                    : t('ginkoCms.studio.collectionsPage.typeFlat')
                }}
                · {{ collection.fieldCount ?? 0 }}
                {{ t('ginkoCms.common.fields').toLowerCase() }}
              </div>
            </div>
          </button>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
