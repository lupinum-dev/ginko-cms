<script setup lang="ts">
import { Grid3x3, List } from '@lucide/vue'

const open = defineModel<boolean>('open', { required: true })
const viewMode = defineModel<'list' | 'grid'>('viewMode', { required: true })
const sortBy = defineModel<string>('sortBy', { required: true })
const typeFilter = defineModel<string>('typeFilter', { required: true })
const timeFilter = defineModel<string>('timeFilter', { required: true })
defineEmits<{ clear: [] }>()

const viewSegments = [
  { value: 'list', label: 'List', icon: List },
  { value: 'grid', label: 'Grid', icon: Grid3x3 },
]
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
        <StudioSegmentedControl
          :model-value="viewMode"
          :items="viewSegments"
          aria-label="View"
          class="ginko:w-fit"
          @update:model-value="viewMode = $event as 'list' | 'grid'"
        />

        <Label class="ginko:text-xs">Sort</Label>
        <Select v-model="sortBy">
          <SelectTrigger class="ginko:h-9 ginko:w-full ginko:text-sm" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="size">Size</SelectItem>
            <SelectItem value="kind">Kind</SelectItem>
          </SelectContent>
        </Select>

        <Label class="ginko:text-xs">Type</Label>
        <Select v-model="typeFilter">
          <SelectTrigger class="ginko:h-9 ginko:w-full ginko:text-sm" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
          </SelectContent>
        </Select>

        <Label class="ginko:text-xs">Date</Label>
        <Select v-model="timeFilter">
          <SelectTrigger class="ginko:h-9 ginko:w-full ginko:text-sm" aria-label="Date">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <div class="ginko:flex ginko:gap-2 ginko:pt-2">
          <Button variant="outline" class="ginko:flex-1" @click="$emit('clear')">Clear</Button>
          <Button class="ginko:flex-1" @click="open = false">Done</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
