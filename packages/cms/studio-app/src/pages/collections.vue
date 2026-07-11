<script setup lang="ts">
import { AlertCircle, ArrowLeft, MousePointerClick } from '@lucide/vue'

import { useStudioCollectionsAdmin } from '../composables/internal/useStudioCollectionsAdmin'
const {
  collectionDetail,
  collectionDetailError,
  collectionDetailPending,
  collectionDraft,
  collectionFieldItems,
  collections,
  defaultLocale,
  error,
  isLoading,
  missingContractSync,
  selectedCollection,
  selectedFieldKey,
  studioSettings,
  t,
} = useStudioCollectionsAdmin()
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.collectionsPage.title')"
        eyebrow="Operations"
        description="Content types available in this Studio and how they appear on the website."
      >
        <template #actions>
          <span
            class="ginko:rounded-full ginko:bg-muted ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:text-muted-foreground"
          >
            {{ collections.length }}
          </span>
          <Badge variant="outline" class="ginko:text-xs">
            {{ t('ginkoCms.studio.collectionsPage.codeDefinedBadge') }}
          </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <div
      v-if="error"
      class="studio-page-content ginko:mt-4 ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
    >
      <AlertCircle class="ginko:size-4 ginko:shrink-0" />
      {{ error }}
    </div>

    <div
      v-else-if="missingContractSync"
      class="studio-page-content ginko:mt-4 ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-md ginko:border ginko:border-warning/25 ginko:bg-warning/10 ginko:p-3 ginko:text-xs ginko:text-warning-fg"
    >
      <AlertCircle class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
      <div>
        <p class="ginko:font-medium">Content setup is still installing.</p>
        <p class="ginko:mt-1 ginko:leading-relaxed">
          Studio is showing the host runtime model so the setup stays inspectable. Editing will be
          available after the content model snapshot finishes installing.
        </p>
      </div>
    </div>

    <div
      class="studio-page-content ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col ginko:overflow-auto ginko:lg:flex-row ginko:lg:overflow-hidden"
    >
      <StudioCollectionsListPanel
        v-model:selected-collection="selectedCollection"
        :collections="collections"
        :is-loading="isLoading"
        :t="t"
        :class="selectedCollection ? 'ginko:hidden ginko:lg:flex' : 'ginko:flex'"
      />

      <div
        class="ginko:min-w-0 ginko:flex-1 ginko:flex-col ginko:overflow-hidden"
        :class="selectedCollection ? 'ginko:flex' : 'ginko:hidden ginko:lg:flex'"
      >
        <div
          v-if="!selectedCollection"
          class="ginko:flex ginko:flex-1 ginko:items-center ginko:justify-center"
        >
          <div class="ginko:text-center">
            <MousePointerClick
              class="ginko:mx-auto ginko:mb-3 ginko:size-8 ginko:text-muted-foreground/30"
            />
            <p class="ginko:text-sm ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.collectionsPage.emptyDescription') }}
            </p>
          </div>
        </div>

        <template v-else>
          <ScrollArea class="ginko:flex-1">
            <div class="studio-page-content ginko:p-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="ginko:mb-3 ginko:lg:hidden"
                @click="selectedCollection = null"
              >
                <ArrowLeft class="ginko:mr-2 ginko:size-4" />
                Content types
              </Button>
              <div class="ginko:divide-y">
                <StudioCollectionContractSection
                  v-model:collection-draft="collectionDraft"
                  :collection-detail="collectionDetail"
                  :collection-detail-error="collectionDetailError"
                  :collection-detail-pending="collectionDetailPending"
                  :selected-collection="selectedCollection"
                  :locales="studioSettings.locales.value"
                  :t="t"
                />

                <StudioCollectionFieldsSection
                  v-model:selected-field-key="selectedFieldKey"
                  :collection-fields="collectionFieldItems"
                  :default-locale="defaultLocale"
                  :t="t"
                />
              </div>
            </div>
          </ScrollArea>
        </template>
      </div>
    </div>
  </StudioWorkspace>
</template>
