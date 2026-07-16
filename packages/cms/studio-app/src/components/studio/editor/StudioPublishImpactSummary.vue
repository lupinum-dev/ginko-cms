<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import { groupWebsiteChanges } from '../../../lib/websiteChangePresenter'
import StudioDeveloperDetails from '../StudioDeveloperDetails.vue'
import StudioWorkflowDiagnosticsList from './StudioWorkflowDiagnosticsList.vue'
import {
  statusToneClass,
  type StudioPublishImpactLocale,
  type StudioPublishImpactState,
  type StudioPublishReviewState,
} from './studioWorkflowTypes'

const props = defineProps<{
  previewScope: 'publish' | 'workflow' | null
  publishImpact: StudioPublishImpactState
  publishReview: StudioPublishReviewState
  showDeveloperDiagnostics?: boolean
  selectedPublishImpactLocale: string | null
}>()

const { t } = useCmsI18n()
const ce = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.collectionEditor.${key}`, params)

function safeWebsiteUrl(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : ''
  } catch {
    return ''
  }
}

function displayAddress(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function displayInclusion(value: boolean): string {
  return value ? ce('publishDialogIncluded') : ce('publishDialogExcluded')
}

const websiteChangeLabels = computed(() => ({
  canonicalUrl: ce('publishImpactCanonicalUrl'),
  empty: ce('publishImpactEmpty'),
  excluded: ce('publishImpactExcluded'),
  included: ce('publishImpactIncluded'),
  navigation: ce('publishDialogNavigation'),
  notSet: ce('publishImpactNotSet'),
  oldUrlRedirect: ce('publishImpactOldUrlRedirect'),
  pageUrl: ce('publishImpactPageUrl'),
  search: ce('publishDialogSearch'),
  sitemap: ce('publishDialogSitemap'),
}))

function websiteChangeGroups(localeImpact: StudioPublishImpactLocale) {
  return groupWebsiteChanges(localeImpact.changes, websiteChangeLabels.value)
}

const previewLocaleImpact = computed<StudioPublishImpactLocale | null>(() => {
  if (!props.publishImpact.locales.length) return null
  if (props.selectedPublishImpactLocale) {
    return (
      props.publishImpact.locales.find(
        (localeImpact) => localeImpact.locale === props.selectedPublishImpactLocale,
      ) ?? props.publishImpact.locales[0]!
    )
  }
  return props.publishImpact.locales[0]!
})

const previewUrl = computed(() =>
  safeWebsiteUrl(previewLocaleImpact.value?.nextHref ?? previewLocaleImpact.value?.nextPath),
)

const liveComparisonUrl = computed(() =>
  safeWebsiteUrl(previewLocaleImpact.value?.currentHref ?? previewLocaleImpact.value?.currentPath),
)

const showWebsitePreview = computed(
  () => props.previewScope === 'publish' && Boolean(previewUrl.value),
)
</script>

<template>
  <div class="ginko:rounded-md ginko:border ginko:bg-background ginko:p-3">
    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2">
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          {{
            previewScope === 'workflow'
              ? ce('publishImpactReadOnlyCheck')
              : ce('publishDialogWebsiteChanges')
          }}
        </div>
        <div
          class="ginko:mt-1 ginko:text-sm ginko:font-medium"
          :class="
            publishImpact.state === 'blocked' || publishImpact.state === 'error'
              ? 'ginko:text-destructive'
              : ''
          "
        >
          {{ publishImpact.message }}
        </div>
      </div>
      <Badge
        variant="outline"
        :class="
          previewScope === 'workflow'
            ? ''
            : statusToneClass(publishReview.state || publishImpact.state)
        "
      >
        {{ previewScope === 'workflow' ? ce('publishImpactReadOnly') : publishReview.label }}
      </Badge>
    </div>

    <div
      v-if="previewScope === 'publish' && publishReview.message"
      class="ginko:mt-2 ginko:text-xs"
      :class="
        publishReview.blocked || publishReview.stale || publishReview.failed
          ? 'ginko:text-destructive'
          : 'ginko:text-muted-foreground'
      "
    >
      {{ publishReview.message }}
    </div>
    <div
      v-if="publishImpact.state === 'pending'"
      class="ginko:mt-3 ginko:text-xs ginko:text-muted-foreground"
    >
      {{ ce('publishImpactPreviewing') }}
    </div>
    <div
      v-else-if="
        publishImpact.state === 'error' ||
        publishImpact.state === 'missing' ||
        publishImpact.state === 'stale'
      "
      class="ginko:mt-3 ginko:text-xs ginko:text-destructive"
    >
      {{ publishImpact.message }}
    </div>
    <div v-else class="ginko:mt-3 ginko:space-y-3">
      <div v-if="previewScope === 'workflow'" class="ginko:text-xs ginko:text-muted-foreground">
        {{
          ce('publishImpactReadOnlyNotice', {
            locale: selectedPublishImpactLocale || ce('publishImpactSelectedLanguage'),
          })
        }}
      </div>

      <div
        v-if="showWebsitePreview"
        class="ginko:overflow-hidden ginko:rounded-md ginko:border ginko:border-border/60"
      >
        <div
          class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2 ginko:border-b ginko:border-border/60 ginko:bg-muted/25 ginko:px-3 ginko:py-2"
        >
          <div class="ginko:min-w-0">
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <div class="ginko:text-sm ginko:font-medium ginko:text-foreground">
                {{ ce('publishImpactWebsitePreview') }}
              </div>
              <Badge variant="outline" class="ginko:font-mono ginko:text-xs">
                {{ previewLocaleImpact?.locale?.toUpperCase() }}
              </Badge>
            </div>
            <div
              class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
            >
              {{ previewUrl }}
            </div>
          </div>
          <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
            <Button
              v-if="liveComparisonUrl && liveComparisonUrl !== previewUrl"
              variant="outline"
              size="sm"
              as-child
            >
              <a :href="liveComparisonUrl" target="_blank" rel="noreferrer">{{
                ce('publishOutcomeOpenLivePage')
              }}</a>
            </Button>
            <Button variant="outline" size="sm" as-child>
              <a :href="previewUrl" target="_blank" rel="noreferrer">{{
                ce('publishImpactOpenPreview')
              }}</a>
            </Button>
          </div>
        </div>
        <div class="ginko:bg-background">
          <iframe
            :src="previewUrl"
            :title="
              ce('publishImpactWebsitePreviewFor', {
                locale: previewLocaleImpact?.locale ?? ce('publishImpactSelectedLanguageShort'),
              })
            "
            class="ginko:block ginko:h-80 ginko:w-full ginko:border-0 ginko:bg-background"
            loading="lazy"
            referrerpolicy="no-referrer"
            sandbox="allow-forms allow-popups allow-scripts"
          />
        </div>
      </div>

      <StudioDeveloperDetails
        v-if="
          showDeveloperDiagnostics &&
          (publishImpact.cacheTags.length || publishImpact.events.length)
        "
        :title="ce('publishImpactTechnicalReceipt')"
      >
        <div v-if="publishImpact.cacheTags.length">
          <div class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
            {{ ce('publishImpactRefreshTargets') }}
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-1">
            <Badge
              v-for="cacheTag in publishImpact.cacheTags"
              :key="`cache:${cacheTag}`"
              variant="outline"
              class="ginko:font-mono ginko:text-xs"
            >
              {{ cacheTag }}
            </Badge>
          </div>
        </div>
        <div v-if="publishImpact.events.length" class="ginko:mt-2">
          <div class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
            {{ ce('publishImpactRefreshMessages') }}
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-1">
            <Badge
              v-for="eventName in publishImpact.events"
              :key="`event:${eventName}`"
              variant="outline"
              class="ginko:font-mono ginko:text-xs"
            >
              {{ eventName }}
            </Badge>
          </div>
        </div>
      </StudioDeveloperDetails>

      <div
        v-for="localeImpact in publishImpact.locales"
        :key="localeImpact.locale"
        class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:p-3"
      >
        <div
          class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2"
        >
          <div class="ginko:flex ginko:items-center ginko:gap-2">
            <Badge variant="outline" class="ginko:text-xs ginko:font-mono">
              {{ localeImpact.locale }}
            </Badge>
            <Badge variant="outline" :class="statusToneClass(localeImpact.status)">
              {{ localeImpact.label }}
            </Badge>
          </div>
          <span
            class="ginko:max-w-full ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            {{ localeImpact.nextHref || localeImpact.nextPath || ce('publishImpactNoPageUrl') }}
          </span>
        </div>

        <div
          class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@2xl:grid-cols-2"
        >
          <div>
            <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
              {{ ce('publishDialogCurrentLivePage') }}
            </div>
            <div class="ginko:mt-0.5 ginko:truncate ginko:font-mono">
              {{
                displayAddress(
                  localeImpact.currentHref || localeImpact.currentPath,
                  ce('publishDialogNotLiveYet'),
                )
              }}
            </div>
          </div>
          <div>
            <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
              {{ ce('publishDialogAfterPublish') }}
            </div>
            <div class="ginko:mt-0.5 ginko:truncate ginko:font-mono">
              {{
                displayAddress(
                  localeImpact.nextHref || localeImpact.nextPath,
                  ce('publishDialogNoPageUrlPlanned'),
                )
              }}
            </div>
          </div>
        </div>

        <div class="ginko:mt-3">
          <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
            {{ ce('publishImpactLiveContentAfter') }}
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-1">
            <Badge variant="outline" class="ginko:text-xs">
              {{ ce('publishDialogSitemap') }} {{ displayInclusion(localeImpact.sitemap.after) }}
            </Badge>
            <Badge variant="outline" class="ginko:text-xs">
              {{ ce('publishDialogSearch') }} {{ displayInclusion(localeImpact.search.after) }}
            </Badge>
            <Badge variant="outline" class="ginko:text-xs">
              {{ ce('publishDialogNavigation') }} {{ displayInclusion(localeImpact.nav.after) }}
            </Badge>
          </div>
        </div>

        <div v-if="localeImpact.changes.length" class="ginko:mt-3 ginko:space-y-3">
          <div
            v-if="websiteChangeGroups(localeImpact).pageAddressRows.length"
            class="ginko:border-t ginko:border-border/60 ginko:pt-3"
          >
            <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
              {{ ce('publishDialogPageAddress') }}
            </div>
            <div class="ginko:mt-2 ginko:grid ginko:gap-2">
              <div
                v-for="change in websiteChangeGroups(localeImpact).pageAddressRows"
                :key="`route:${localeImpact.locale}:${change.key}`"
                class="ginko:grid ginko:gap-1 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div class="ginko:font-medium ginko:text-foreground">{{ change.label }}</div>
                <div class="ginko:min-w-0">
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactBefore') }}
                  </span>
                  <span class="ginko:block ginko:break-words ginko:font-mono">
                    {{ change.before }}
                  </span>
                </div>
                <div class="ginko:min-w-0">
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactAfter') }}
                  </span>
                  <span class="ginko:block ginko:break-words ginko:font-mono ginko:text-foreground">
                    {{ change.after }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="websiteChangeGroups(localeImpact).searchPreviewRows.length"
            class="ginko:border-t ginko:border-border/60 ginko:pt-3"
          >
            <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
              {{ ce('publishDialogSearchPreview') }}
            </div>
            <div class="ginko:mt-2 ginko:grid ginko:gap-2">
              <div
                v-for="change in websiteChangeGroups(localeImpact).searchPreviewRows"
                :key="`search-preview:${localeImpact.locale}:${change.key}`"
                class="ginko:grid ginko:gap-1 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div class="ginko:font-medium ginko:text-foreground">{{ change.label }}</div>
                <div class="ginko:min-w-0">
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactBefore') }}
                  </span>
                  <span class="ginko:block ginko:break-words ginko:font-mono">
                    {{ change.before }}
                  </span>
                </div>
                <div class="ginko:min-w-0">
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactAfter') }}
                  </span>
                  <span class="ginko:block ginko:break-words ginko:font-mono ginko:text-foreground">
                    {{ change.after }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="websiteChangeGroups(localeImpact).visibilityRows.length"
            class="ginko:border-t ginko:border-border/60 ginko:pt-3"
          >
            <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
              {{ ce('publishDialogWebsiteVisibility') }}
            </div>
            <div class="ginko:mt-2 ginko:grid ginko:gap-2">
              <div
                v-for="change in websiteChangeGroups(localeImpact).visibilityRows"
                :key="`visibility:${localeImpact.locale}:${change.key}`"
                class="ginko:grid ginko:gap-1 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div class="ginko:font-medium ginko:text-foreground">{{ change.label }}</div>
                <div>
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactBefore') }}
                  </span>
                  {{ change.before }}
                </div>
                <div>
                  <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                    {{ ce('publishImpactAfter') }}
                  </span>
                  <span class="ginko:text-foreground">{{ change.after }}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div
              v-if="websiteChangeGroups(localeImpact).seoSettingRows.length"
              class="ginko:border-t ginko:border-border/60 ginko:pt-3"
            >
              <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
                {{ ce('publishImpactSeoSettings') }}
              </div>
              <div class="ginko:mt-2 ginko:grid ginko:gap-2">
                <div
                  v-for="change in websiteChangeGroups(localeImpact).seoSettingRows"
                  :key="`seo:${localeImpact.locale}:${change.key}`"
                  class="ginko:grid ginko:gap-1 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div class="ginko:font-medium ginko:text-foreground">{{ change.label }}</div>
                  <div>
                    <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                      {{ ce('publishImpactBefore') }}
                    </span>
                    {{ change.before }}
                  </div>
                  <div>
                    <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                      {{ ce('publishImpactAfter') }}
                    </span>
                    <span class="ginko:text-foreground">{{ change.after }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="websiteChangeGroups(localeImpact).otherRows.length"
              class="ginko:border-t ginko:border-border/60 ginko:pt-3"
            >
              <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
                {{ ce('publishImpactOtherChanges') }}
              </div>
              <div class="ginko:mt-2 ginko:grid ginko:gap-2">
                <div
                  v-for="change in websiteChangeGroups(localeImpact).otherRows"
                  :key="`other:${localeImpact.locale}:${change.key}`"
                  class="ginko:grid ginko:gap-1 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div class="ginko:font-medium ginko:text-foreground">{{ change.label }}</div>
                  <div>
                    <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                      {{ ce('publishImpactBefore') }}
                    </span>
                    {{ change.before }}
                  </div>
                  <div>
                    <span class="ginko:block ginko:text-xs ginko:font-medium ginko:uppercase">
                      {{ ce('publishImpactAfter') }}
                    </span>
                    <span class="ginko:text-foreground">{{ change.after }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StudioWorkflowDiagnosticsList
          class="ginko:mt-3"
          :diagnostics="localeImpact.visibleBlockers"
          :hidden-count="localeImpact.hiddenBlockerCount"
          :item-key-prefix="`impact:${localeImpact.locale}:blocker`"
          more-label-key="Blocker"
        />
        <StudioWorkflowDiagnosticsList
          class="ginko:mt-3"
          :diagnostics="localeImpact.visibleWarnings"
          :item-key-prefix="`impact:${localeImpact.locale}:warning`"
          more-label-key="Warning"
        />
      </div>
    </div>
  </div>
</template>
