<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../composables/useCmsI18n'

const props = withDefaults(
  defineProps<{
    title?: string
    framed?: boolean
  }>(),
  {
    title: '',
    framed: true,
  },
)
const { t } = useCmsI18n()
const titleText = computed(() => props.title || t('ginkoCms.studio.common.developerDetails'))
</script>

<template>
  <details
    :class="
      props.framed ? 'ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30' : ''
    "
  >
    <summary
      :class="
        props.framed
          ? 'ginko:cursor-pointer ginko:px-3 ginko:py-2 ginko:text-xs ginko:font-medium'
          : 'ginko:cursor-pointer ginko:text-xs ginko:font-medium'
      "
    >
      {{ titleText }}
    </summary>
    <div :class="props.framed ? 'ginko:border-t ginko:border-border/40 ginko:p-3' : 'ginko:mt-2'">
      <slot />
    </div>
  </details>
</template>
