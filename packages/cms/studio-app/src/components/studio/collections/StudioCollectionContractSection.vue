<script setup lang="ts">
import { AlertTriangle, Code2, Database, Route, Settings2 } from '@lucide/vue'
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
  lastImportRun?: {
    importRunId: string
    kind: 'preview' | 'apply'
    status: 'previewed' | 'blocked' | 'applied' | 'published' | 'failed'
    publish: boolean
    blockerCount: number
    warningCount: number
    publishedCount: number
    createdAt: number
  } | null
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

const routeCapabilities = [
  'Page routes',
  'Navigation',
  'Surround',
  'Search',
  'Sitemap',
  'SEO',
  'Website changes preview',
]
const dataOnlyCapabilities = ['Lists', 'Relations', 'Single-entry content', 'Site-wide content']

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

const lastImport = computed(() => props.collectionDetail?.lastImportRun ?? null)

function importToneClass(status: string) {
  if (status === 'blocked' || status === 'failed') {
    return 'ginko:border-destructive/40 ginko:bg-destructive/10 ginko:text-destructive-fg'
  }
  if (status === 'published' || status === 'applied') {
    return 'ginko:border-success/40 ginko:bg-success/10 ginko:text-success-fg'
  }
  return 'ginko:border-border ginko:bg-muted/50 ginko:text-muted-foreground'
}
</script>

<template>
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:pb-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-56 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Settings2 class="ginko:size-4 ginko:text-muted-foreground" />
        Content type details
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        Managed by developers ·
        {{ collectionDraft.mode === 'route' ? 'Creates website pages' : 'Shared content' }}
      </p>
    </div>
    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div
        v-if="collectionDetailPending"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3 ginko:text-xs ginko:text-muted-foreground"
      >
        Loading the selected content type...
      </div>
      <div
        v-else-if="collectionDetailError"
        class="ginko:rounded-lg ginko:border ginko:border-destructive/40 ginko:bg-destructive/10 ginko:p-3 ginko:text-xs ginko:text-destructive-fg"
      >
        Failed to load the selected content type. {{ collectionDetailError.message }}
      </div>
      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3">
        <div class="ginko:flex ginko:items-start ginko:gap-3">
          <Code2 class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:space-y-1">
            <div class="ginko:text-sm ginko:font-medium">
              {{ collectionDraft.label || selectedCollection }}
            </div>
            <p class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
              This content type is managed by developers and synced into Studio as setup details.
              Change fields, routing, locales, and website behavior in the application config, then
              resync the app.
            </p>
          </div>
        </div>
      </div>
      <div
        class="ginko:space-y-3 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3"
      >
        <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
          <div>
            <Label class="ginko:text-xs ginko:text-muted-foreground">Website use</Label>
            <div
              class="ginko:mt-1 ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm ginko:font-medium"
            >
              <Route
                v-if="collectionDraft.mode === 'route'"
                class="ginko:size-4 ginko:text-muted-foreground"
              />
              <Database v-else class="ginko:size-4 ginko:text-muted-foreground" />
              {{ collectionDraft.mode === 'route' ? 'Creates website pages' : 'Shared content' }}
            </div>
            <p
              class="ginko:mt-1 ginko:max-w-2xl ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
            >
              {{
                collectionDraft.mode === 'route'
                  ? 'Creates public pages with localized routes, visibility diagnostics, sitemap/search/nav participation, SEO, and website-change checks.'
                  : 'Stores structured content for lists, relations, single-entry content, and site-wide content without page routes.'
              }}
            </p>
          </div>
          <Badge variant="secondary" class="ginko:text-xs">Managed by developers</Badge>
        </div>
        <div class="ginko:flex ginko:flex-wrap ginko:gap-1.5">
          <Badge
            v-for="capability in collectionDraft.mode === 'route'
              ? routeCapabilities
              : dataOnlyCapabilities"
            :key="capability"
            variant="outline"
            class="ginko:text-xs"
          >
            {{ capability }}
          </Badge>
        </div>
        <div
          v-if="collectionDraft.mode === 'none'"
          class="ginko:space-y-2 ginko:rounded-md ginko:border ginko:border-dashed ginko:bg-background ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
        >
          <p>
            Page controls are hidden for shared-content types. Sitemap, search, navigation, and
            route diagnostics do not apply until this content type creates website pages.
          </p>
          <div
            v-if="normalizedPathPrefix && normalizedPathPrefix !== '/'"
            class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2"
          >
            <span>
              Stale URL prefix:
              <code class="ginko:font-mono ginko:text-foreground">{{ normalizedPathPrefix }}</code>
            </span>
            <span>Update the code-defined collection config to clear it.</span>
          </div>
        </div>
      </div>
      <div class="ginko:grid ginko:gap-3 ginko:sm:grid-cols-2">
        <StudioDeveloperDetails>
          <dl class="ginko:space-y-1 ginko:text-xs">
            <div class="ginko:flex ginko:justify-between ginko:gap-3">
              <dt class="ginko:text-muted-foreground">Slug</dt>
              <dd class="ginko:font-mono ginko:text-foreground">{{ selectedCollection }}</dd>
            </div>
            <div class="ginko:flex ginko:justify-between ginko:gap-3">
              <dt class="ginko:text-muted-foreground">Type</dt>
              <dd class="ginko:text-foreground">{{ collectionDetail?.type ?? 'flat' }}</dd>
            </div>
            <div class="ginko:flex ginko:justify-between ginko:gap-3">
              <dt class="ginko:text-muted-foreground">Icon</dt>
              <dd class="ginko:font-mono ginko:text-foreground">
                {{ collectionDraft.icon || 'none' }}
              </dd>
            </div>
            <div class="ginko:flex ginko:justify-between ginko:gap-3">
              <dt class="ginko:text-muted-foreground">Source</dt>
              <dd class="ginko:text-foreground">
                {{ collectionDetail?.contract?.source === 'code' ? 'managed in code' : 'unknown' }}
              </dd>
            </div>
            <div class="ginko:flex ginko:justify-between ginko:gap-3">
              <dt class="ginko:text-muted-foreground">Model version</dt>
              <dd class="ginko:font-mono ginko:text-foreground">
                {{ collectionDetail?.contract?.version ?? 'not synced' }}
              </dd>
            </div>
          </dl>
        </StudioDeveloperDetails>
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
            No locales are configured for this collection.
          </p>
        </div>
      </div>
      <div
        v-if="collectionDraft.mode === 'route'"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3"
      >
        <StudioDeveloperDetails :framed="false">
          <dl class="ginko:grid ginko:gap-2 ginko:text-xs ginko:sm:grid-cols-2">
            <div
              v-for="[label, value] in routeFacts"
              :key="label"
              class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5"
            >
              <dt class="ginko:text-muted-foreground">{{ label }}</dt>
              <dd class="ginko:font-mono ginko:text-foreground">{{ value }}</dd>
            </div>
          </dl>
          <p class="ginko:mt-2 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
            Public routes, redirects, sitemap, search, and navigation diagnostics are evaluated from
            these developer-managed settings.
          </p>
        </StudioDeveloperDetails>
      </div>
      <div class="ginko:grid ginko:gap-3 ginko:lg:grid-cols-2">
        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3">
          <div class="ginko:flex ginko:items-start ginko:justify-between ginko:gap-3">
            <div>
              <Label class="ginko:text-xs ginko:text-muted-foreground">Live website content</Label>
              <p class="ginko:mt-1 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
                Website reads use active live content only. Draft saves do not change these rows.
              </p>
            </div>
            <Badge
              variant="outline"
              :class="
                collectionDetail?.projectionStatus?.activeCollectionProjectionRunId ||
                collectionDetail?.projectionStatus?.activeSiteProjectionRunId
                  ? 'ginko:border-success/40 ginko:bg-success/10 ginko:text-success-fg'
                  : ''
              "
            >
              {{
                collectionDetail?.projectionStatus?.activeCollectionProjectionRunId ||
                collectionDetail?.projectionStatus?.activeSiteProjectionRunId
                  ? 'active'
                  : 'none'
              }}
            </Badge>
          </div>
          <StudioDeveloperDetails class="ginko:mt-3" :framed="false">
            <dl class="ginko:space-y-1 ginko:text-xs">
              <div
                v-for="[label, value] in projectionFacts"
                :key="label"
                class="ginko:flex ginko:justify-between ginko:gap-3 ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5"
              >
                <dt class="ginko:text-muted-foreground">{{ label }}</dt>
                <dd
                  class="ginko:max-w-[14rem] ginko:truncate ginko:font-mono ginko:text-foreground"
                >
                  {{ value }}
                </dd>
              </div>
            </dl>
          </StudioDeveloperDetails>
        </div>
        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3">
          <div class="ginko:flex ginko:items-start ginko:justify-between ginko:gap-3">
            <div>
              <Label class="ginko:text-xs ginko:text-muted-foreground">Last content import</Label>
              <p class="ginko:mt-1 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
                Imports apply content under this developer-managed content setup. Unknown fields and
                blocked relations are reported instead of changing the content setup.
              </p>
            </div>
            <Badge
              v-if="lastImport"
              variant="outline"
              class="ginko:capitalize"
              :class="importToneClass(lastImport.status)"
            >
              {{ lastImport.status }}
            </Badge>
            <Badge v-else variant="outline">none</Badge>
          </div>
          <dl
            v-if="lastImport"
            class="ginko:mt-3 ginko:grid ginko:grid-cols-3 ginko:gap-2 ginko:text-xs"
          >
            <div class="ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-muted-foreground">Blockers</dt>
              <dd class="ginko:font-medium ginko:text-foreground">{{ lastImport.blockerCount }}</dd>
            </div>
            <div class="ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-muted-foreground">Warnings</dt>
              <dd class="ginko:font-medium ginko:text-foreground">{{ lastImport.warningCount }}</dd>
            </div>
            <div class="ginko:rounded-md ginko:bg-muted/30 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-muted-foreground">Published</dt>
              <dd class="ginko:font-medium ginko:text-foreground">
                {{ lastImport.publishedCount }}
              </dd>
            </div>
          </dl>
          <StudioDeveloperDetails v-if="lastImport" class="ginko:mt-3" :framed="false">
            <p class="ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground">
              {{ lastImport.importRunId }}
            </p>
          </StudioDeveloperDetails>
        </div>
      </div>
      <div
        v-if="capabilityWarnings.length"
        class="ginko:space-y-2 ginko:rounded-md ginko:border ginko:border-warning/30 ginko:bg-warning/10 ginko:p-3"
      >
        <div
          class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-xs ginko:font-medium ginko:text-warning-fg"
        >
          <AlertTriangle class="ginko:size-4" />
          Review collection config
        </div>
        <ul class="ginko:space-y-1 ginko:text-xs ginko:leading-relaxed ginko:text-warning-fg/90">
          <li v-for="warning in capabilityWarnings" :key="warning">- {{ warning }}</li>
        </ul>
      </div>
    </div>
  </section>
</template>
