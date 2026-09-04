<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Scoped library navigation for the split pane: all-media + collections + tag
// filters, plus the trash entry in manage mode. Injects the browser context.
const { t } = useCmsI18n()
const { finder, mode } = useStudioAssetBrowserContext()
</script>

<template>
  <aside
    :aria-label="t('ginkoCms.studio.assetBrowser.navAriaLabel')"
    class="ginko:flex ginko:h-full ginko:min-h-0 ginko:flex-col"
  >
    <ScrollArea class="ginko:flex-1">
      <div class="ginko:py-3">
        <div class="ginko:mb-2">
          <div class="ginko:px-4 ginko:py-1">
            <span
              class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
            >
              {{ t('ginkoCms.studio.assetBrowser.sectionLibrary') }}
            </span>
          </div>
          <nav class="ginko:space-y-px ginko:px-2">
            <button
              class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
              :class="
                finder.isSidebarActive('full', 'all')
                  ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                  : 'ginko:text-foreground/80 ginko:hover:bg-accent'
              "
              @click="finder.selectSidebar('full', 'all')"
            >
              <Icon
                name="lucide:layers"
                class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
              />
              <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{
                t('ginkoCms.studio.assetBrowser.allMedia')
              }}</span>
              <span
                v-if="(finder.sidebarFullViews.value[0]?.count ?? 0) > 0"
                class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                >{{ finder.sidebarFullViews.value[0]?.count }}</span
              >
            </button>
            <button
              v-for="item in finder.sidebarCollections.value"
              :key="`coll:${item.key}`"
              class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
              :class="
                finder.isSidebarActive('collections', item.key)
                  ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                  : 'ginko:text-foreground/80 ginko:hover:bg-accent'
              "
              @click="finder.selectSidebar('collections', item.key)"
            >
              <Icon :name="item.icon" class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
              <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ item.label }}</span>
              <span
                v-if="item.count > 0"
                class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                >{{ item.count }}</span
              >
            </button>
          </nav>
        </div>

        <div v-if="finder.sidebarTags.value.length > 0" class="ginko:mb-2">
          <div class="ginko:px-4 ginko:py-1">
            <span
              class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
            >
              {{ t('ginkoCms.studio.assetBrowser.sectionTags') }}
            </span>
          </div>
          <nav class="ginko:space-y-px ginko:px-2">
            <button
              v-for="tag in finder.sidebarTags.value"
              :key="`tag:${tag.key}`"
              class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
              :class="
                finder.isSidebarActive('tags', tag.key)
                  ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                  : 'ginko:text-foreground/80 ginko:hover:bg-accent'
              "
              @click="finder.selectSidebar('tags', tag.key)"
            >
              <div
                class="ginko:size-[10px] ginko:shrink-0 ginko:rounded-full"
                :style="{ backgroundColor: tag.color }"
              />
              <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ tag.label }}</span>
              <span
                v-if="tag.count > 0"
                class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                >{{ tag.count }}</span
              >
            </button>
          </nav>
        </div>

        <div v-if="mode.mode.value === 'manage'" class="ginko:mx-2 ginko:border-t ginko:pt-2">
          <button
            class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
            :class="
              finder.isSidebarActive('trash', 'trash')
                ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                : 'ginko:text-foreground/80 ginko:hover:bg-accent'
            "
            @click="finder.selectSidebar('trash', 'trash')"
          >
            <Trash2 class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
            <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{
              t('ginkoCms.studio.assetBrowser.trash')
            }}</span>
            <span
              v-if="finder.trashCount.value > 0"
              class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
              >{{ finder.trashCount.value }}</span
            >
          </button>
        </div>
      </div>
    </ScrollArea>
  </aside>
</template>
