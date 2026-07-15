<script setup lang="ts">
import { Code2, Database, Route, Settings2 } from '@lucide/vue'
import { computed } from 'vue'

import { deriveCapabilityWarnings } from '../../../lib/publicWorkflow'

defineOptions({
  name: 'StudioCollectionContractSection',
})

type LocaleOption = {
  code: string
  label?: string
}

type CollectionDetail = {
  type?: string
  mode?: 'route' | 'none'
  routing?: {
    slugMode?: string
    rootSlug?: string | null
  } | null
  slugMode?: string | null
  contract?: {
    source: 'code'
    version: string
  }
  projectionStatus?: {
    activeCollectionProjectionRunId: string | null
    activeSiteProjectionRunId: string | null
    activatedAt: number | null
  }
}

type CollectionDraft = {
  id: string
  label: string
  pathPrefix: string
  icon: string
  localized: string
  maxDepth: string
  singleton: boolean
  mode: 'route' | 'none'
}

const props = defineProps<{
  collectionDetail: CollectionDetail | null
  collectionDetailError?: Error | null
  collectionDetailPending?: boolean
  selectedCollection: string
  locales: LocaleOption[]
  t: (key: string, params?: Record<string, unknown>) => string
}>()

const collectionDraft = defineModel<CollectionDraft>('collectionDraft', {
  required: true,
})

const selectedLocales = computed(() =>
  collectionDraft.value.localized
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean),
)

const normalizedPathPrefix = computed(() => collectionDraft.value.pathPrefix.trim())

const capabilityWarnings = computed(() =>
  deriveCapabilityWarnings({
    mode: collectionDraft.value.mode,
    pathPrefix: collectionDraft.value.pathPrefix,
    locales: selectedLocales.value,
    t: props.t,
  }),
)

const localeLabelsByCode = computed(() =>
  Object.fromEntries(props.locales.map((locale) => [locale.code, locale.label ?? locale.code])),
)

const routeFacts = computed(() => [
  ['Path prefix', collectionDraft.value.pathPrefix || '/'],
  [
    'Slug mode',
    props.collectionDetail?.routing?.slugMode ?? props.collectionDetail?.slugMode ?? 'shared',
  ],
  ['Root slug', props.collectionDetail?.routing?.rootSlug ?? 'none'],
  ['Singleton', collectionDraft.value.singleton ? 'yes' : 'no'],
  ['Tree depth', collectionDraft.value.maxDepth || 'unlimited'],
])

const projectionFacts = computed(() => [
  [
    'Collection batch',
    props.collectionDetail?.projectionStatus?.activeCollectionProjectionRunId ??
      (collectionDraft.value.mode === 'route' ? 'none active' : 'not route-backed'),
  ],
  [
    'Site batch',
    props.collectionDetail?.projectionStatus?.activeSiteProjectionRunId ?? 'none active',
  ],
])
</script>

<template>
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:pb-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-56 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <Settings2 class="ginko:size-4 ginko:text-muted-foreground" />
        {{ t('ginkoCms.studio.collectionsPage.collectionSettings') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ t('ginkoCms.studio.collectionsPage.codeDefinedBadge') }} ·
        {{
          collectionDraft.mode === 'route'
            ? t('ginkoCms.studio.collectionContract.createsWebsitePages')
            : t('ginkoCms.studio.collectionContract.sharedContent')
        }}
      </p>
    </div>
    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div
        v-if="collectionDetailPending"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3 ginko:text-xs ginko:text-muted-foreground"
      >
        {{ t('ginkoCms.studio.collectionContract.loadingType') }}
      </div>
      <StudioNotice
        v-else-if="collectionDetailError"
        tone="danger"
        :description="
          t('ginkoCms.studio.collectionContract.loadError', {
            message: collectionDetailError.message,
          })
        "
      />
      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3">
        <div class="ginko:flex ginko:items-start ginko:gap-3">
          <Code2 class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:space-y-1">
            <div class="ginko:text-sm ginko:font-medium">
              {{ collectionDraft.label || selectedCollection }}
            </div>
            <p class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.collectionContract.managedDescription') }}
            </p>
          </div>
        </div>
      </div>
      <div
        class="ginko:space-y-3 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3"
      >
        <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
          <div>
            <Label class="ginko:text-xs ginko:text-muted-foreground">{{
              t('ginkoCms.studio.collectionContract.websiteUse')
            }}</Label>
            <div
              class="ginko:mt-1 ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm ginko:font-medium"
            >
              <Route
                v-if="collectionDraft.mode === 'route'"
                class="ginko:size-4 ginko:text-muted-foreground"
              />
              <Database v-else class="ginko:size-4 ginko:text-muted-foreground" />
              {{
                collectionDraft.mode === 'route'
                  ? t('ginkoCms.studio.collectionContract.createsWebsitePages')
                  : t('ginkoCms.studio.collectionContract.sharedContent')
              }}
            </div>
            <p
              class="ginko:mt-1 ginko:max-w-2xl ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
            >
              {{
                collectionDraft.mode === 'route'
                  ? t('ginkoCms.studio.collectionContract.routeModeDescription')
                  : t('ginkoCms.studio.collectionContract.dataModeDescription')
              }}
            </p>
          </div>
          <Badge variant="secondary" class="ginko:text-xs">{{
            t('ginkoCms.studio.collectionsPage.codeDefinedBadge')
          }}</Badge>
        </div>
        <div
          v-if="collectionDraft.mode === 'none'"
          class="ginko:space-y-2 ginko:rounded-md ginko:border ginko:border-dashed ginko:bg-background ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
        >
          <p>
            {{ t('ginkoCms.studio.collectionContract.pageControlsHidden') }}
          </p>
          <div
            v-if="normalizedPathPrefix && normalizedPathPrefix !== '/'"
            class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2"
          >
            <span>
              {{ t('ginkoCms.studio.collectionContract.outOfDatePrefix') }}
              <code class="ginko:font-mono ginko:text-foreground">{{ normalizedPathPrefix }}</code>
            </span>
            <span>{{ t('ginkoCms.studio.collectionContract.clearPrefixHint') }}</span>
          </div>
        </div>
      </div>
      <div class="ginko:grid ginko:gap-3">
        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3">
          <Label class="ginko:text-xs ginko:text-muted-foreground">{{
            t('ginkoCms.studio.collectionsPage.supportedLocales')
          }}</Label>
          <div
            v-if="selectedLocales.length > 0"
            class="ginko:mt-2 ginko:flex ginko:flex-wrap ginko:gap-1.5"
          >
            <Badge
              v-for="locale in selectedLocales"
              :key="locale"
              variant="outline"
              class="ginko:font-mono ginko:text-xs"
            >
              {{ locale }}
              <span
                v-if="localeLabelsByCode[locale]"
                class="ginko:ml-1 ginko:font-sans ginko:text-muted-foreground"
              >
                {{ localeLabelsByCode[locale] }}
              </span>
            </Badge>
          </div>
          <p v-else class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground">
            {{ t('ginkoCms.studio.collectionContract.noLocalesConfigured') }}
          </p>
        </div>
      </div>
      <div class="ginko:grid ginko:gap-3 ginko:lg:grid-cols-2">
        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3">
          <div class="ginko:flex ginko:items-start ginko:justify-between ginko:gap-3">
            <div>
              <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                t('ginkoCms.studio.collectionContract.liveWebsiteContent')
              }}</Label>
              <p class="ginko:mt-1 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
                {{ t('ginkoCms.studio.collectionContract.liveContentDescription') }}
              </p>
            </div>
            <Badge
              variant="outline"
              :class="
                collectionDetail?.projectionStatus?.activeCollectionProjectionRunId ||
                collectionDetail?.projectionStatus?.activeSiteProjectionRunId
                  ? 'ginko:border-success/40 ginko:bg-success/10 ginko:dark:bg-success/15 ginko:text-success-fg'
                  : ''
              "
            >
              {{
                collectionDetail?.projectionStatus?.activeCollectionProjectionRunId ||
                collectionDetail?.projectionStatus?.activeSiteProjectionRunId
                  ? t('ginkoCms.studio.collectionContract.active')
                  : t('ginkoCms.studio.collectionContract.none')
              }}
            </Badge>
          </div>
        </div>
      </div>
      <!-- One Advanced-details surface per screen (design review S3): slug,
           schema, routing, and projection facts live together behind a single
           disclosure instead of three scattered ones. -->
      <StudioDeveloperDetails>
        <div class="ginko:space-y-3">
          <dl class="ginko:grid ginko:gap-2 ginko:text-xs ginko:sm:grid-cols-2">
            <div
              v-for="[label, value] in [
                ['Slug', selectedCollection],
                ['Type', collectionDetail?.type ?? 'flat'],
                ['Icon', collectionDraft.icon || 'none'],
                [
                  'Source',
                  collectionDetail?.contract?.source === 'code' ? 'managed in code' : 'unknown',
                ],
                ['Model version', collectionDetail?.contract?.version ?? 'not synced'],
                ...(collectionDraft.mode === 'route' ? routeFacts : []),
                ...projectionFacts,
              ]"
              :key="String(label)"
              class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5"
            >
              <dt class="ginko:text-muted-foreground">{{ label }}</dt>
              <dd class="ginko:max-w-[14rem] ginko:truncate ginko:font-mono ginko:text-foreground">
                {{ value }}
              </dd>
            </div>
          </dl>
          <p
            v-if="collectionDraft.mode === 'route'"
            class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
          >
            {{ t('ginkoCms.studio.collectionContract.developerRoutesNote') }}
          </p>
        </div>
      </StudioDeveloperDetails>
      <StudioNotice
        v-if="capabilityWarnings.length"
        tone="warning"
        :title="t('ginkoCms.studio.collectionContract.reviewConfig')"
      >
        <ul class="ginko:space-y-1 ginko:text-xs ginko:leading-relaxed">
          <li v-for="warning in capabilityWarnings" :key="warning">- {{ warning }}</li>
        </ul>
      </StudioNotice>
    </div>
  </section>
</template>
