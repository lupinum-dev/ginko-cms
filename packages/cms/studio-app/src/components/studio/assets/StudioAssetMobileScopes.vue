<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

import type {
  SidebarMode,
  StudioAssetBrowserMode,
} from '../../../composables/internal/assetFinderTypes'

type SidebarItem = { key: string; label: string; icon: string; count: number }
type SidebarTag = { key: string; label: string; color: string; count: number }

defineProps<{
  mode: StudioAssetBrowserMode
  collections: SidebarItem[]
  tags: SidebarTag[]
  fullViews: SidebarItem[]
  trashCount: number
  isActive: (mode: SidebarMode, key: string) => boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ select: [mode: SidebarMode, key: string] }>()

function select(mode: SidebarMode, key: string) {
  emit('select', mode, key)
  open.value = false
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="left" class="ginko:w-[19rem] ginko:max-w-[85vw] ginko:p-0 ginko:md:hidden">
      <SheetHeader class="ginko:border-b ginko:pr-12">
        <SheetTitle class="ginko:text-sm">Browse media</SheetTitle>
        <SheetDescription>Choose an owner, tag, view, or trash.</SheetDescription>
      </SheetHeader>
      <ScrollArea class="ginko:flex-1">
        <div class="ginko:py-3">
          <div
            v-for="group in [
              { label: 'Collections', mode: 'collections' as const, items: collections },
              { label: 'Library views', mode: 'full' as const, items: fullViews },
            ]"
            :key="group.mode"
            class="ginko:mb-2"
          >
            <div class="ginko:px-4 ginko:py-1">
              <span
                class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >{{ group.label }}</span
              >
            </div>
            <nav class="ginko:space-y-px ginko:px-2">
              <button
                v-for="item in group.items"
                :key="item.key"
                class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                :class="
                  isActive(group.mode, item.key)
                    ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                    : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                "
                @click="select(group.mode, item.key)"
              >
                <Icon :name="item.icon" class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
                <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ item.label }}</span>
                <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                  item.count
                }}</span>
              </button>
            </nav>
          </div>

          <div v-if="tags.length > 0" class="ginko:mb-2">
            <div class="ginko:px-4 ginko:py-1">
              <span
                class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >Tags</span
              >
            </div>
            <nav class="ginko:space-y-px ginko:px-2">
              <button
                v-for="tag in tags"
                :key="tag.key"
                class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                :class="
                  isActive('tags', tag.key)
                    ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                    : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                "
                @click="select('tags', tag.key)"
              >
                <span
                  class="ginko:size-[10px] ginko:shrink-0 ginko:rounded-full"
                  :style="{ backgroundColor: tag.color }"
                />
                <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ tag.label }}</span>
                <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                  tag.count
                }}</span>
              </button>
            </nav>
          </div>

          <div v-if="mode === 'manage'" class="ginko:mx-2 ginko:border-t ginko:pt-2">
            <button
              class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
              :class="
                isActive('trash', 'trash')
                  ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                  : 'ginko:text-foreground/80 ginko:hover:bg-accent'
              "
              @click="select('trash', 'trash')"
            >
              <Trash2 class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
              <span class="ginko:flex-1 ginko:text-left">Trash</span>
              <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                trashCount
              }}</span>
            </button>
          </div>
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
</template>
