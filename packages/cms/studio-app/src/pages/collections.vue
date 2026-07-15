<script setup lang="ts">
import { ArrowLeft, MousePointerClick } from '@lucide/vue'

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
        :eyebrow="t('ginkoCms.studio.layout.operations')"
        :description="t('ginkoCms.studio.collectionsPage.headerDescription')"
      >
        <template #actions>
          <Badge variant="secondary" class="ginko:text-xs ginko:tabular-nums">
            {{ collections.length }}
          </Badge>
          <Badge variant="outline" class="ginko:text-xs">
            {{ t('ginkoCms.studio.collectionsPage.codeDefinedBadge') }}
          </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <div
      v-if="error || missingContractSync"
      class="studio-page-content ginko:px-4 ginko:pt-2 ginko:lg:px-6"
    >
      <StudioNotice v-if="error" tone="danger" :description="error" />
      <StudioNotice
        v-else
        tone="warning"
        :title="t('ginkoCms.studio.collectionsPage.installingTitle')"
        :description="t('ginkoCms.studio.collectionsPage.installingDescription')"
      />
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
          class="ginko:flex ginko:flex-1 ginko:items-center ginko:justify-center ginko:p-4 ginko:lg:p-6"
        >
          <StudioEmptyState
            :title="t('ginkoCms.studio.collectionsPage.emptyTitle')"
            :description="t('ginkoCms.studio.collectionsPage.emptyDescription')"
            class="ginko:max-w-md"
          >
            <template #icon>
              <MousePointerClick class="ginko:size-5" aria-hidden="true" />
            </template>
          </StudioEmptyState>
        </div>

        <template v-else>
          <ScrollArea class="ginko:flex-1">
            <div class="studio-page-content ginko:p-4 ginko:lg:p-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="ginko:mb-3 ginko:lg:hidden"
                @click="selectedCollection = null"
              >
                <ArrowLeft class="ginko:mr-2 ginko:size-4" />
                {{ t('ginkoCms.studio.collectionsPage.backToList') }}
              </Button>
              <div class="ginko:divide-y ginko:divide-border/60">
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
