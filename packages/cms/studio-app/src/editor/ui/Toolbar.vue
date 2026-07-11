<script setup lang="ts">
import {
  AlignVerticalJustifyCenter,
  Columns2,
  Columns3,
  FileText,
  Image,
  Maximize2,
  Minimize2,
  Minus,
  Rows2,
  Rows3,
  Table,
  Trash2,
  Video,
} from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { computed, toRef } from 'vue'

import { useToolbarActions } from '../model/useToolbarActions'

defineOptions({
  name: 'GinkoToolbar',
})

const props = defineProps<{
  editor: Editor | null | undefined
  enableFiles?: boolean
  enableVideo?: boolean
  isFocusMode?: boolean
  isTypewriterMode?: boolean
}>()
const emit = defineEmits<{
  'open-file': []
  'open-image': []
  'remove-media': []
  'open-video': []
  'toggle-focus': []
  'toggle-typewriter': []
}>()

const editor = toRef(() => props.editor)

const {
  addColumnAfter,
  addRowAfter,
  blocks,
  deleteColumn,
  deleteRow,
  headings,
  insertFile,
  insertHr,
  insertImage,
  insertTable,
  insertVideo,
  isActive,
  marks,
  removeMedia,
  toggleBlock,
  toggleHeading,
  toggleMark,
} = useToolbarActions(editor)

const hasTableSelection = computed(() => {
  return isActive('table') || isActive('tableCell') || isActive('tableHeader')
})

const activeMediaType = computed<'file' | 'image' | 'video' | null>(() => {
  if (isActive('image')) {
    return 'image'
  }
  if (isActive('file')) {
    return 'file'
  }
  if (isActive('video')) {
    return 'video'
  }
  return null
})
</script>

<template>
  <div
    v-if="editor"
    :class="[
      isFocusMode
        ? 'ginko-richtext-focus-header ginko:border-b ginko:border-border/40 ginko:bg-background'
        : 'ginko-richtext-toolbar ginko:flex ginko:items-center ginko:gap-1 ginko:overflow-x-auto ginko:border-b ginko:border-border/50 ginko:bg-card ginko:px-2 ginko:py-1.5',
    ]"
  >
    <div
      v-if="isFocusMode"
      class="ginko:flex ginko:h-12 ginko:items-center ginko:justify-between ginko:gap-4 ginko:px-4 ginko:sm:px-6"
    >
      <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-3">
        <div
          class="ginko:grid ginko:size-7 ginko:shrink-0 ginko:place-items-center ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/50 ginko:text-muted-foreground"
        >
          <Maximize2 class="ginko:size-3.5" />
        </div>
        <div class="ginko:min-w-0 ginko:leading-tight">
          <div class="ginko:truncate ginko:text-sm ginko:font-semibold ginko:text-foreground">
            Focus editor
          </div>
          <div class="ginko:truncate ginko:text-xs ginko:text-muted-foreground">
            Full-screen writing mode
          </div>
        </div>
      </div>

      <div class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          :class="[
            'ginko:h-8 ginko:gap-1.5 ginko:px-2.5 ginko:text-xs',
            isTypewriterMode
              ? 'ginko:bg-muted ginko:text-foreground ginko:hover:bg-muted'
              : 'ginko:text-muted-foreground ginko:hover:text-foreground',
          ]"
          :title="isTypewriterMode ? 'Disable typewriter scrolling' : 'Enable typewriter scrolling'"
          :aria-pressed="isTypewriterMode"
          @click="emit('toggle-typewriter')"
        >
          <AlignVerticalJustifyCenter class="ginko:size-4" />
          <span class="ginko:hidden ginko:sm:inline">Typewriter</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="ginko:h-8 ginko:gap-1.5 ginko:px-2.5 ginko:text-xs"
          title="Exit focus mode (Esc)"
          :aria-pressed="isFocusMode"
          @click="emit('toggle-focus')"
        >
          <Minimize2 class="ginko:size-4" />
          <span class="ginko:hidden ginko:sm:inline">Exit</span>
        </Button>
      </div>
    </div>

    <div
      :class="[
        'ginko-richtext-toolbar ginko:flex ginko:items-center ginko:gap-1 ginko:overflow-x-auto ginko:px-2 ginko:py-1.5',
        isFocusMode
          ? 'ginko:mx-auto ginko:w-full ginko:max-w-[min(100%,72rem)] ginko:border-t ginko:border-border/30 ginko:bg-background'
          : '',
      ]"
    >
      <div class="ginko-richtext-toolbar__group ginko:flex ginko:items-center ginko:gap-1">
        <Button
          v-for="heading in headings"
          :key="heading.level"
          size="sm"
          :variant="isActive('heading', { level: heading.level }) ? 'default' : 'ghost'"
          class="ginko:h-7 ginko:px-2 ginko:text-xs"
          @click="toggleHeading(heading.level)"
        >
          {{ heading.label }}
        </Button>
      </div>

      <Separator
        orientation="vertical"
        class="ginko-richtext-toolbar__separator ginko:mx-1 ginko:data-[orientation=vertical]:h-5"
      />

      <div class="ginko-richtext-toolbar__group ginko:flex ginko:items-center ginko:gap-1">
        <Button
          v-for="mark in marks"
          :key="mark.name"
          size="sm"
          :variant="isActive(mark.name) ? 'default' : 'ghost'"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          :title="mark.title"
          @click="toggleMark(mark.name)"
        >
          <Icon :name="mark.icon" class="ginko:size-4" />
        </Button>
      </div>

      <Separator
        orientation="vertical"
        class="ginko-richtext-toolbar__separator ginko:mx-1 ginko:data-[orientation=vertical]:h-5"
      />

      <div class="ginko-richtext-toolbar__group ginko:flex ginko:items-center ginko:gap-1">
        <Button
          v-for="block in blocks"
          :key="block.name"
          size="sm"
          :variant="isActive(block.name) ? 'default' : 'ghost'"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          :title="block.title"
          @click="toggleBlock(block.name)"
        >
          <Icon :name="block.icon" class="ginko:size-4" />
        </Button>
      </div>

      <Separator
        orientation="vertical"
        class="ginko-richtext-toolbar__separator ginko:mx-1 ginko:data-[orientation=vertical]:h-5"
      />

      <div class="ginko-richtext-toolbar__group ginko:flex ginko:items-center ginko:gap-1">
        <Button
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          :title="activeMediaType === 'image' ? 'Replace image' : 'Insert image'"
          @click="insertImage(() => emit('open-image'))"
        >
          <Image class="ginko:size-4" />
        </Button>
        <Button
          v-if="enableFiles"
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          :title="activeMediaType === 'file' ? 'Replace file' : 'Insert file'"
          @click="insertFile(() => emit('open-file'))"
        >
          <FileText class="ginko:size-4" />
        </Button>
        <Button
          v-if="enableVideo"
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          :title="activeMediaType === 'video' ? 'Edit video' : 'Insert video'"
          @click="insertVideo(() => emit('open-video'))"
        >
          <Video class="ginko:size-4" />
        </Button>
        <Button
          v-if="activeMediaType"
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0 ginko:text-destructive"
          title="Remove selected media"
          @click="removeMedia(() => emit('remove-media'))"
        >
          <Trash2 class="ginko:size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          title="Insert horizontal rule"
          @click="insertHr"
        >
          <Minus class="ginko:size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0"
          title="Insert table"
          @click="insertTable"
        >
          <Table class="ginko:size-4" />
        </Button>
        <template v-if="hasTableSelection">
          <Button
            size="sm"
            variant="ghost"
            class="ginko:h-7 ginko:w-7 ginko:!px-0"
            title="Add row"
            @click="addRowAfter"
          >
            <Rows3 class="ginko:size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="ginko:h-7 ginko:w-7 ginko:!px-0"
            title="Add column"
            @click="addColumnAfter"
          >
            <Columns3 class="ginko:size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="ginko:h-7 ginko:w-7 ginko:!px-0 ginko:text-destructive"
            title="Delete row"
            @click="deleteRow"
          >
            <Rows2 class="ginko:size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="ginko:h-7 ginko:w-7 ginko:!px-0 ginko:text-destructive"
            title="Delete column"
            @click="deleteColumn"
          >
            <Columns2 class="ginko:size-4" />
          </Button>
        </template>
      </div>

      <Separator
        v-if="!isFocusMode"
        orientation="vertical"
        class="ginko-richtext-toolbar__separator ginko:mx-1 ginko:data-[orientation=vertical]:h-5"
      />

      <div
        v-if="!isFocusMode"
        :class="[
          'ginko-richtext-toolbar__group ginko:ml-auto ginko:flex ginko:items-center ginko:gap-1',
        ]"
      >
        <Button
          size="sm"
          variant="ghost"
          class="ginko:h-7 ginko:w-7 ginko:!px-0 ginko:text-muted-foreground ginko:hover:text-foreground"
          title="Enter focus mode"
          :aria-pressed="isFocusMode"
          @click="emit('toggle-focus')"
        >
          <Maximize2 class="ginko:size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ginko-richtext-focus-header {
  position: sticky;
  top: 0;
  z-index: 20;
}

.ginko-richtext-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
}

.ginko-richtext-focus-header .ginko-richtext-toolbar {
  position: static;
}

.ginko-richtext-toolbar__group {
  flex-wrap: nowrap;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .ginko-richtext-toolbar__separator {
    display: none;
  }
}
</style>
