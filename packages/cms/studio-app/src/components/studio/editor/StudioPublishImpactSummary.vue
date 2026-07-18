<script setup lang="ts">
import { computed } from 'vue'

import { useOptionalStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsConfig } from '../../../composables/useCmsConfig'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { draftPreviewPath } from '../../../lib/publicWorkflow'
import { formatBoundedCount, groupWebsiteChanges } from '../../../lib/websiteChangePresenter'
import StudioDeveloperDetails from '../StudioDeveloperDetails.vue'
import StudioWorkflowDiagnosticsList from './StudioWorkflowDiagnosticsList.vue'
import {
  publishReviewStateLabelKey,
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

const { t, dateLocale } = useCmsI18n()
const editor = useOptionalStudioEntryEditorContext()
const cmsConfig = useCmsConfig()
const ce = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.collectionEditor.${key}`, params)

function languageDisplayName(code: string | null | undefined): string {
  if (!code) return ''
  try {
    const name = new Intl.DisplayNames([dateLocale.value], { type: 'language' }).of(code)
    if (name && name !== code) return name
  } catch {
    // fall through to the raw code
  }
  return code.toUpperCase()
}

// Editor-facing headline (PUB-02): the backend summary string carries the raw
// entry id and reads like a log line, so it never renders here. Ready states
// get marketer copy built from the affected page URL; blocked/error states
// keep their diagnostic message.
const impactHeadline = computed(() => {
  if (props.publishImpact.state !== 'ready') return props.publishImpact.message
  const targets = props.publishImpact.locales.filter(
    (localeImpact) => localeImpact.nextPath || localeImpact.nextHref,
  )
  if (targets.length > 1) {
    return ce('publishImpactReadyHeadlineMulti', { count: targets.length })
  }
  const target = targets[0]
  if (target) {
    return ce('publishImpactReadyHeadlineUrl', {
      url: target.nextPath || target.nextHref,
      language: languageDisplayName(target.locale),
    })
  }
  return ce('publishImpactReadyHeadline')
})

// The review message repeats the same backend summary when everything is
// fine; it only adds information when something blocks the publish AND it
// says something the headline does not already say.
const showReviewMessage = computed(
  () =>
    props.previewScope === 'publish' &&
    Boolean(props.publishReview.message) &&
    (props.publishReview.blocked || props.publishReview.stale || props.publishReview.failed) &&
    props.publishReview.message !== impactHeadline.value,
)

const reviewBadgeLabel = computed(() => {
  const key = publishReviewStateLabelKey(props.publishReview.state)
  return key ? ce(key) : props.publishReview.label
})

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

// EDT-10: the rendered preview opens the guarded DRAFT preview route on the
// host, never the prospective live URL (which 404s until publish). The mono
// line keeps showing the future public address.
const draftPreviewUrl = computed(() =>
  editor
    ? draftPreviewPath({
        previewRoute: cmsConfig.preview?.route,
        collection: editor.loader.collection,
        entryId: editor.loader.entryId,
        locale: previewLocaleImpact.value?.locale ?? editor.loader.currentLocale,
      })
    : null,
)

function handleDraftPreviewOpened() {
  editor?.workflow?.markDraftPreviewOpened()
}

const showWebsitePreview = computed(
  () => props.previewScope === 'publish' && Boolean(draftPreviewUrl.value || previewUrl.value),
)

// States where no preview content exists to render: the headline carries the
// failure/stale message, so the body must not fall through to the ready layout.
const isFailureState = computed(() =>
  ['error', 'failed', 'missing', 'stale'].includes(props.publishImpact.state),
)
</script>

<template>
  <div class="ginko:min-w-0 ginko:rounded-md ginko:border ginko:bg-background ginko:p-3">
    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2">
      <div class="ginko:min-w-0">
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          {{
            previewScope === 'workflow'
              ? ce('publishImpactReadOnlyCheck')
              : ce('publishDialogWebsiteChanges')
          }}
        </div>
        <div
          class="ginko:mt-1 ginko:break-words ginko:text-sm ginko:font-medium"
          :class="
            ['blocked', 'error', 'failed', 'missing'].includes(publishImpact.state)
              ? 'ginko:text-destructive'
              : ''
          "
        >
          {{ impactHeadline }}
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
        {{ previewScope === 'workflow' ? ce('publishImpactReadOnly') : reviewBadgeLabel }}
      </Badge>
    </div>

    <div v-if="showReviewMessage" class="ginko:mt-2 ginko:text-xs ginko:text-destructive">
      {{ publishReview.message }}
    </div>
    <div
      v-if="publishImpact.state === 'pending'"
      class="ginko:mt-3 ginko:text-xs ginko:text-muted-foreground"
    >
      {{ ce('publishImpactPreviewing') }}
    </div>
    <template v-else-if="isFailureState">
      <!-- The headline above already carries publishImpact.message. For a
           concurrent-edit failure, add the same recovery the top bar's
           conflict notice offers instead of leaving the editor without a way
           out. -->
      <div v-if="editor?.publishing.publishSession.concurrentEdit" class="ginko:mt-3">
        <Button
          variant="outline"
          size="sm"
          @click="editor?.workflow?.reloadLatestDraftAndPreview()"
        >
          {{ ce('saveConflictReload') }}
        </Button>
      </div>
    </template>
    <div v-else class="ginko:mt-3 ginko:space-y-3">
      <div v-if="previewScope === 'workflow'" class="ginko:text-xs ginko:text-muted-foreground">
        {{
          ce('publishImpactReadOnlyNotice', {
            locale: selectedPublishImpactLocale || ce('publishImpactSelectedLanguage'),
          })
        }}
      </div>

      <!-- No inline iframe here: the rail is 320px wide and the live site
           rendered inside it reads as a bug. The preview opens in a new tab. -->
      <div
        v-if="showWebsitePreview"
        class="ginko:overflow-hidden ginko:rounded-md ginko:border ginko:border-border/60"
      >
        <div
          class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2 ginko:bg-muted/25 ginko:px-3 ginko:py-2"
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
            <!-- The rendered preview is the guarded draft-preview route: it
                 shows the SAVED DRAFT, works before first publish, and marks
                 the draft as actually previewed for the publish dialog. -->
            <Button v-if="draftPreviewUrl" variant="outline" size="sm" as-child>
              <a
                :href="draftPreviewUrl"
                target="_blank"
                rel="noreferrer"
                @click="handleDraftPreviewOpened"
                >{{ ce('publishImpactOpenDraftPreview') }}</a
              >
            </Button>
          </div>
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
        class="ginko:min-w-0 ginko:rounded-md ginko:border ginko:border-border/40 ginko:p-3"
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
            class="ginko:min-w-0 ginko:max-w-full ginko:break-all ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            {{ localeImpact.nextHref || localeImpact.nextPath || ce('publishImpactNoPageUrl') }}
          </span>
        </div>

        <div
          class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@2xl:grid-cols-2"
        >
          <div class="ginko:min-w-0">
            <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
              {{ ce('publishDialogCurrentLivePage') }}
            </div>
            <div class="ginko:mt-0.5 ginko:break-all ginko:font-mono">
              {{
                displayAddress(
                  localeImpact.currentHref || localeImpact.currentPath,
                  ce('publishDialogNotLiveYet'),
                )
              }}
            </div>
          </div>
          <div class="ginko:min-w-0">
            <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
              {{ ce('publishDialogAfterPublish') }}
            </div>
            <div class="ginko:mt-0.5 ginko:break-all ginko:font-mono">
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

        <div
          v-if="(localeImpact.routeImpact?.listed ?? 0) > 0"
          class="ginko:mt-3 ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2 ginko:border-t ginko:border-border/60 ginko:pt-3"
        >
          <div class="ginko:text-xs ginko:text-muted-foreground">
            {{
              ce('publishImpactDescendantRoutesShown', {
                listed: localeImpact.routeImpact?.listed ?? 0,
                total: formatBoundedCount(
                  localeImpact.routeImpact?.total ?? localeImpact.routeImpact?.listed ?? 0,
                  localeImpact.routeImpact?.total === null,
                ),
              })
            }}
          </div>
          <Button
            v-if="localeImpact.routeImpact?.hasMore"
            variant="outline"
            size="sm"
            :disabled="localeImpact.routeImpact?.loading"
            @click="editor?.workflow?.loadMorePublishImpact(localeImpact.locale)"
          >
            {{ t('ginkoCms.common.loadMore') }}
          </Button>
          <div
            v-if="localeImpact.routeImpact?.error"
            class="ginko:basis-full ginko:text-xs ginko:text-destructive"
          >
            {{ localeImpact.routeImpact?.error }}
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
