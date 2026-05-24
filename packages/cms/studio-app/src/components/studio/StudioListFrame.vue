<script setup lang="ts">
import { cn } from '../ui/utils'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    count?: number | string
    loading?: boolean
    empty?: boolean
    class?: string
    density?: 'compact' | 'comfortable'
  }>(),
  {
    title: undefined,
    description: undefined,
    count: undefined,
    loading: false,
    empty: false,
    class: undefined,
    density: 'comfortable',
  },
)
</script>

<template>
  <section
    :data-density="props.density"
    :class="
      cn(
        'studio-reveal ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card',
        props.class,
      )
    "
  >
    <header
      v-if="title || description || count !== undefined || $slots.header || $slots.actions"
      class="ginko:flex ginko:min-w-0 ginko:items-start ginko:justify-between ginko:gap-4 ginko:border-b ginko:border-border/30 ginko:bg-muted/20 ginko:px-5 ginko:py-3"
    >
      <slot name="header">
        <div class="ginko:min-w-0">
          <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2">
            <h2
              v-if="title"
              class="ginko:truncate ginko:text-[13px] ginko:font-semibold ginko:text-foreground"
            >
              {{ title }}
            </h2>
            <Badge
              v-if="count !== undefined"
              variant="outline"
              class="ginko:rounded-full ginko:text-[11px]"
            >
              {{ count }}
            </Badge>
          </div>
          <p
            v-if="description"
            class="ginko:mt-1 ginko:text-[12px] ginko:leading-5 ginko:text-muted-foreground/80"
          >
            {{ description }}
          </p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="ginko:shrink-0">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="loading" class="ginko:p-4">
      <slot name="loading">
        <div class="ginko:space-y-3">
          <Skeleton
            v-for="index in 3"
            :key="index"
            class="ginko:h-12 ginko:w-full ginko:rounded-md"
          />
        </div>
      </slot>
    </div>
    <slot v-else-if="empty" name="empty" />
    <div v-else>
      <slot />
    </div>
  </section>
</template>
