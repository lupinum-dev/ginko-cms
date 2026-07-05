<script setup lang="ts">
import { Database, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { useStudioSiteDataAdmin } from '../composables/internal/useStudioSiteDataAdmin'
const {
  activeLocale,
  blockData,
  blocks,
  canManageSettings,
  dateLocale,
  deleteTarget,
  error,
  expandedBlock,
  expandedBlockData,
  handleCreateBlock,
  handleDeleteBlock,
  handleSave,
  handleVisibilityChange,
  isLoading,
  locales,
  newBlock,
  saving,
  showNewForm,
  t,
  toggleBlock,
} = useStudioSiteDataAdmin()

const localeItems = computed(() =>
  locales.value.map((locale) => ({
    value: locale.code,
    label: locale.label || locale.code.toUpperCase(),
  })),
)
const expandedBlockSchema = computed(() =>
  expandedBlockData.value?.schemaType ? { type: expandedBlockData.value.schemaType } : undefined,
)

function resolveBlockLabel(
  label: string | Record<string, string> | null | undefined,
  fallback: string,
): string {
  return typeof label === 'string' ? label : fallback
}

function handleDeleteDialogOpen(value: boolean) {
  if (!value) deleteTarget.value = null
}

function formatBlockData(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.siteDataPage.title')"
        :eyebrow="t('ginkoCms.studio.layout.editor')"
        :description="t('ginkoCms.studio.siteDataPage.description')"
      >
        <template #actions>
          <Badge variant="outline" class="ginko:rounded-full ginko:text-xs">
            {{
              t('ginkoCms.studio.siteDataPage.blocksCount', {
                count: blocks.length,
              })
            }}
          </Badge>
          <Button v-if="canManageSettings" size="sm" @click="showNewForm = !showNewForm">
            <Plus class="ginko:mr-1.5 ginko:size-3.5" />
            {{ t('ginkoCms.studio.siteDataPage.newBlock') }}
          </Button>
        </template>
      </StudioPageHeader>
    </template>

    <template v-if="locales.length > 1" #toolbar>
      <div
        class="ginko:shrink-0 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-5 ginko:py-3"
      >
        <div class="studio-page-content ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
          <span class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ t('ginkoCms.common.locale') }}
          </span>
          <StudioSegmentedControl
            v-model="activeLocale"
            :items="localeItems"
            :aria-label="t('ginkoCms.common.locale')"
          />
        </div>
      </div>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-4 ginko:sm:p-5">
        <!-- Error -->
        <StudioNotice v-if="error" tone="danger" class="ginko:mb-4" :description="error" />

        <!-- New block form -->
        <StudioListFrame
          v-if="showNewForm && canManageSettings"
          class="ginko:mb-5"
          :title="t('ginkoCms.studio.siteDataPage.createTitle')"
        >
          <div class="ginko:space-y-4 ginko:p-4">
            <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:md:grid-cols-2">
              <div class="ginko:space-y-1.5">
                <Label for="new-key" class="ginko:text-xs"
                  >{{ t('ginkoCms.common.key') }}
                  <span class="ginko:text-destructive">*</span></Label
                >
                <Input
                  id="new-key"
                  v-model="newBlock.key"
                  :placeholder="t('ginkoCms.studio.siteDataPage.keyPlaceholder')"
                  class="ginko:h-8 ginko:text-sm"
                />
              </div>
              <div class="ginko:space-y-1.5">
                <Label for="new-label" class="ginko:text-xs">{{
                  t('ginkoCms.common.label')
                }}</Label>
                <Input
                  id="new-label"
                  v-model="newBlock.label"
                  :placeholder="t('ginkoCms.studio.siteDataPage.labelPlaceholder')"
                  class="ginko:h-8 ginko:text-sm"
                />
              </div>
            </div>
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-3"
            >
              <label class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm">
                <Switch
                  :checked="newBlock.localized"
                  @update:checked="newBlock.localized = $event"
                />
                <span class="ginko:text-xs">{{ t('ginkoCms.common.localized') }}</span>
              </label>
              <label class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm">
                <Switch
                  :checked="newBlock.visibility === 'public'"
                  @update:checked="newBlock.visibility = $event ? 'public' : 'private'"
                />
                <span class="ginko:text-xs">{{ t('ginkoCms.studio.siteDataPage.publicApi') }}</span>
              </label>
              <div class="ginko:flex ginko:gap-2">
                <Button variant="outline" size="sm" @click="showNewForm = false">
                  {{ t('ginkoCms.common.cancel') }}
                </Button>
                <Button size="sm" @click="handleCreateBlock">
                  {{ t('ginkoCms.common.create') }}
                </Button>
              </div>
            </div>
          </div>
        </StudioListFrame>

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="ginko:space-y-3">
          <div
            v-for="i in 3"
            :key="`skeleton-block-${i}`"
            class="ginko:rounded-lg ginko:border ginko:px-4 ginko:py-3"
          >
            <div class="ginko:flex ginko:items-center ginko:gap-3">
              <Skeleton class="ginko:size-4 ginko:shrink-0" />
              <div class="ginko:min-w-0 ginko:flex-1 ginko:space-y-2">
                <div class="ginko:flex ginko:items-center ginko:gap-2">
                  <Skeleton class="ginko:h-4 ginko:w-28" />
                  <Skeleton class="ginko:h-4 ginko:w-16 ginko:rounded-full" />
                </div>
                <Skeleton class="ginko:h-3 ginko:w-40" />
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <StudioEmptyState
          v-else-if="blocks.length === 0 && !showNewForm"
          :title="t('ginkoCms.studio.siteDataPage.emptyTitle')"
          :description="t('ginkoCms.studio.siteDataPage.emptyDescription')"
        >
          <template #icon>
            <Database class="ginko:size-5" aria-hidden="true" />
          </template>
          <template #action>
            <Button v-if="canManageSettings" size="sm" @click="showNewForm = true">
              <Plus class="ginko:mr-1.5 ginko:size-3.5" />
              {{ t('ginkoCms.studio.siteDataPage.createBlock') }}
            </Button>
          </template>
        </StudioEmptyState>

        <!-- Block list -->
        <StudioListFrame v-else :count="blocks.length">
          <div
            v-for="block in blocks"
            :key="block.key"
            class="ginko:border-b ginko:border-border/60 ginko:last:border-b-0"
          >
            <!-- Block header (always visible) -->
            <div
              class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_auto_auto] ginko:items-center ginko:gap-2 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-muted/30"
            >
              <button
                type="button"
                class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-3 ginko:rounded-sm ginko:text-left ginko:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
                :aria-expanded="expandedBlock === block.key"
                :aria-controls="`site-data-block-${block.key}`"
                @click="toggleBlock(block.key)"
              >
                <Icon
                  :name="
                    expandedBlock === block.key ? 'lucide:chevron-down' : 'lucide:chevron-right'
                  "
                  class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground"
                />
                <div class="ginko:min-w-0">
                  <div class="ginko:flex ginko:items-center ginko:gap-2">
                    <span class="ginko:text-sm ginko:font-medium">{{
                      resolveBlockLabel(block.label, block.key)
                    }}</span>
                    <Badge v-if="block.localized" variant="secondary" class="ginko:text-[10px]">
                      i18n
                    </Badge>
                    <Badge
                      :variant="block.visibility === 'public' ? 'secondary' : 'outline'"
                      class="ginko:text-[10px]"
                    >
                      {{
                        block.visibility === 'public'
                          ? t('ginkoCms.studio.siteDataPage.publicVisibility')
                          : t('ginkoCms.studio.siteDataPage.privateVisibility')
                      }}
                    </Badge>
                  </div>
                  <p v-if="block.updatedAt" class="ginko:text-xs ginko:text-muted-foreground">
                    {{ t('ginkoCms.common.updated') }}
                    <NuxtTime
                      :datetime="block.updatedAt"
                      :locale="dateLocale"
                      month="short"
                      day="numeric"
                      hour="2-digit"
                      minute="2-digit"
                    />
                  </p>
                </div>
              </button>
              <Button
                v-if="canManageSettings"
                variant="ghost"
                size="sm"
                :title="
                  block.visibility === 'public'
                    ? t('ginkoCms.studio.siteDataPage.hidePublicTitle')
                    : t('ginkoCms.studio.siteDataPage.exposePublicTitle')
                "
                @click.stop="
                  handleVisibilityChange(
                    block.key,
                    block.visibility === 'public' ? 'private' : 'public',
                  )
                "
              >
                {{
                  block.visibility === 'public'
                    ? t('ginkoCms.studio.siteDataPage.makePrivate')
                    : t('ginkoCms.studio.siteDataPage.makePublic')
                }}
              </Button>
              <Button
                v-if="canManageSettings"
                variant="ghost"
                size="sm"
                class="ginko:text-destructive ginko:hover:text-destructive ginko:shrink-0"
                @click.stop="
                  deleteTarget = {
                    key: block.key,
                    label: resolveBlockLabel(block.label, block.key),
                    localized: block.localized,
                    visibility: block.visibility,
                  }
                "
              >
                <Trash2 class="ginko:size-3.5" />
              </Button>
            </div>

            <!-- Block editor (expanded) -->
            <div
              v-if="expandedBlock === block.key"
              :id="`site-data-block-${block.key}`"
              class="ginko:space-y-3 ginko:border-t ginko:px-4 ginko:py-4"
            >
              <StudioSiteDataEditor
                v-if="canManageSettings"
                :schema="expandedBlockSchema"
                :model-value="blockData[block.key] ?? {}"
                @update:model-value="blockData[block.key] = $event"
              />
              <StudioDeveloperDetails>
                <div class="ginko:space-y-3">
                  <div class="ginko:text-xs">
                    <span class="ginko:text-muted-foreground">Section key:</span>
                    <code class="ginko:ml-2 ginko:font-mono ginko:text-foreground">{{
                      block.key
                    }}</code>
                  </div>
                  <pre
                    class="ginko:max-h-80 ginko:overflow-auto ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-background ginko:p-3 ginko:text-xs ginko:leading-relaxed"
                    >{{ formatBlockData(blockData[block.key] ?? {}) }}</pre
                  >
                </div>
              </StudioDeveloperDetails>
              <div v-if="canManageSettings" class="ginko:flex ginko:justify-end">
                <Button size="sm" :disabled="saving === block.key" @click="handleSave(block.key)">
                  <Loader2
                    v-if="saving === block.key"
                    class="ginko:size-3.5 ginko:mr-1.5 ginko:animate-spin"
                  />
                  {{ t('ginkoCms.common.save') }}
                </Button>
              </div>
            </div>
          </div>
        </StudioListFrame>
      </div>
    </ScrollArea>
  </StudioWorkspace>
  <StudioConfirmDialog
    :open="!!deleteTarget"
    :title="t('ginkoCms.studio.siteDataPage.deleteTitle')"
    :description="t('ginkoCms.studio.siteDataPage.deleteDescription')"
    :confirm-label="t('ginkoCms.studio.siteDataPage.deleteConfirm')"
    @update:open="handleDeleteDialogOpen"
    @confirm="
      deleteTarget &&
      handleDeleteBlock(deleteTarget.key).finally(() => {
        deleteTarget = null
      })
    "
  >
    <div v-if="deleteTarget" class="ginko:space-y-2 ginko:text-sm ginko:text-muted-foreground">
      <div>Delete "{{ deleteTarget.label }}"?</div>
      <div
        class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/40 ginko:p-3 ginko:text-xs"
      >
        <div>
          Key:
          <code class="ginko:font-mono ginko:text-foreground">{{ deleteTarget.key }}</code>
        </div>
        <div>
          Visibility:
          <span class="ginko:text-foreground">{{ deleteTarget.visibility }}</span>
        </div>
        <div>
          Localized:
          <span class="ginko:text-foreground">{{ deleteTarget.localized ? 'yes' : 'no' }}</span>
        </div>
        <div v-if="deleteTarget.visibility === 'public'" class="ginko:mt-2 ginko:text-destructive">
          This block is exposed through public site-data reads.
        </div>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
