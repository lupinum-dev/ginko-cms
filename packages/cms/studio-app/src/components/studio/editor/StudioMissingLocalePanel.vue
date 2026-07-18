<script setup lang="ts">
import { Languages, Plus } from '@lucide/vue'
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'

const props = defineProps<{
  locale: string
  side: 'primary' | 'secondary'
  canEdit: boolean
}>()

const emit = defineEmits<{
  add: []
}>()

const { t } = useCmsI18n()
const localeLabel = computed(() => props.locale.toUpperCase())
const headingId = computed(() => `missing-locale-${props.side}-${props.locale}`)
</script>

<template>
  <section
    class="ginko:flex ginko:min-h-64 ginko:flex-col ginko:items-center ginko:justify-center ginko:rounded-xl ginko:border ginko:border-dashed ginko:border-border ginko:bg-card ginko:px-6 ginko:py-10 ginko:text-center ginko:shadow-sm"
    :aria-labelledby="headingId"
  >
    <div
      class="ginko:mb-4 ginko:flex ginko:size-10 ginko:items-center ginko:justify-center ginko:rounded-full ginko:bg-muted ginko:text-muted-foreground"
    >
      <Languages class="ginko:size-5" aria-hidden="true" />
    </div>
    <h2 :id="headingId" class="ginko:text-base ginko:font-semibold ginko:text-foreground">
      {{
        t('ginkoCms.studio.collectionEditor.missingTranslationTitle', {
          locale: localeLabel,
        })
      }}
    </h2>
    <p class="ginko:mt-1.5 ginko:max-w-md ginko:text-sm ginko:text-muted-foreground">
      {{ t('ginkoCms.studio.collectionEditor.missingTranslationDescription') }}
    </p>
    <Button v-if="canEdit" class="ginko:mt-5" @click="emit('add')">
      <Plus class="ginko:size-4" aria-hidden="true" />
      {{ t('ginkoCms.studio.collectionEditor.addTranslation') }}
    </Button>
    <p v-else class="ginko:mt-4 ginko:text-sm ginko:text-muted-foreground">
      {{ t('ginkoCms.studio.collectionEditor.missingTranslationNoPermission') }}
    </p>
  </section>
</template>
