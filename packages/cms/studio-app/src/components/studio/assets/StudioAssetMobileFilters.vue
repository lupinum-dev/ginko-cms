<script setup lang="ts">
import { Grid3x3, List } from '@lucide/vue'

const open = defineModel<boolean>('open', { required: true })
const viewMode = defineModel<'list' | 'grid'>('viewMode', { required: true })
const sortBy = defineModel<string>('sortBy', { required: true })
const typeFilter = defineModel<string>('typeFilter', { required: true })
const timeFilter = defineModel<string>('timeFilter', { required: true })
defineEmits<{ clear: [] }>()
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="bottom"
      class="ginko:max-h-[85dvh] ginko:rounded-t-xl ginko:p-0 ginko:sm:hidden"
    >
      <SheetHeader class="ginko:border-b ginko:pr-12">
        <SheetTitle class="ginko:text-sm">Filter media</SheetTitle>
        <SheetDescription>Adjust the current asset view.</SheetDescription>
      </SheetHeader>
      <div class="ginko:grid ginko:gap-3 ginko:p-4">
        <Label class="ginko:text-xs">View</Label>
        <div
          class="ginko:inline-flex ginko:w-fit ginko:items-center ginko:rounded-lg ginko:bg-muted/60 ginko:p-0.5"
        >
          <button
            v-for="option in [
              { value: 'list' as const, icon: List },
              { value: 'grid' as const, icon: Grid3x3 },
            ]"
            :key="option.value"
            class="ginko:inline-flex ginko:h-8 ginko:w-8 ginko:items-center ginko:justify-center ginko:rounded-md ginko:transition-[color,background-color] ginko:duration-150 ginko:ease-out"
            :class="
              viewMode === option.value
                ? 'ginko:bg-background'
                : 'ginko:text-muted-foreground ginko:hover:text-foreground'
            "
            @click="viewMode = option.value"
          >
            <component :is="option.icon" class="ginko:size-4" />
          </button>
        </div>

        <Label class="ginko:text-xs">Sort</Label>
        <select
          v-model="sortBy"
          class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
        >
          <option value="name">Name</option>
          <option value="date">Date</option>
          <option value="size">Size</option>
          <option value="kind">Kind</option>
        </select>

        <Label class="ginko:text-xs">Type</Label>
        <select
          v-model="typeFilter"
          class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="document">Documents</option>
        </select>

        <Label class="ginko:text-xs">Date</Label>
        <select
          v-model="timeFilter"
          class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
        >
          <option value="any">Any time</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>

        <div class="ginko:flex ginko:gap-2 ginko:pt-2">
          <Button variant="outline" class="ginko:flex-1" @click="$emit('clear')">Clear</Button>
          <Button class="ginko:flex-1" @click="open = false">Done</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
