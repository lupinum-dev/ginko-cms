<script setup lang="ts">
import StudioDeveloperDetails from '../StudioDeveloperDetails.vue'
import StudioWorkflowDiagnosticsList from './StudioWorkflowDiagnosticsList.vue'
import {
  statusToneClass,
  type StudioPublishImpactState,
  type StudioPublishReviewState,
} from './studioWorkflowTypes'

defineProps<{
  previewScope: 'publish' | 'workflow' | null
  publishImpact: StudioPublishImpactState
  publishReview: StudioPublishReviewState
  showDeveloperDiagnostics?: boolean
  selectedPublishImpactLocale: string | null
}>()
</script>

<template>
  <div class="ginko:rounded-md ginko:border ginko:bg-background ginko:p-3">
    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2">
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          {{ previewScope === 'workflow' ? 'Read-only readiness preview' : 'Website changes' }}
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
        {{ previewScope === 'workflow' ? 'Read-only' : publishReview.label }}
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
      Previewing website changes...
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
        This is a read-only saved-draft preview for
        {{ selectedPublishImpactLocale || 'the selected locale' }}. It does not confirm the header
        Publish action.
      </div>

      <StudioDeveloperDetails
        v-if="
          showDeveloperDiagnostics &&
          (publishImpact.cacheTags.length ||
            publishImpact.events.length ||
            (previewScope === 'publish' && publishReview.previewHash))
        "
        title="Developer diagnostics"
      >
        <div v-if="publishImpact.cacheTags.length">
          <div class="ginko:text-[10px] ginko:uppercase ginko:text-muted-foreground">
            Cache tags
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-1">
            <Badge
              v-for="cacheTag in publishImpact.cacheTags"
              :key="`cache:${cacheTag}`"
              variant="outline"
              class="ginko:font-mono ginko:text-[10px]"
            >
              {{ cacheTag }}
            </Badge>
          </div>
        </div>
        <div v-if="publishImpact.events.length" class="ginko:mt-2">
          <div class="ginko:text-[10px] ginko:uppercase ginko:text-muted-foreground">Events</div>
          <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-1">
            <Badge
              v-for="eventName in publishImpact.events"
              :key="`event:${eventName}`"
              variant="outline"
              class="ginko:font-mono ginko:text-[10px]"
            >
              {{ eventName }}
            </Badge>
          </div>
        </div>
        <div v-if="previewScope === 'publish' && publishReview.previewHash" class="ginko:mt-2">
          <div class="ginko:text-[10px] ginko:uppercase ginko:text-muted-foreground">
            Preview hash
          </div>
          <div class="ginko:mt-1 ginko:font-mono ginko:text-[10px] ginko:text-muted-foreground">
            {{ publishReview.previewHash.slice(0, 32) }}
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
            <Badge variant="outline" class="ginko:text-[10px] ginko:font-mono">
              {{ localeImpact.locale }}
            </Badge>
            <Badge variant="outline" :class="statusToneClass(localeImpact.status)">
              {{ localeImpact.label }}
            </Badge>
          </div>
          <span
            class="ginko:max-w-full ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            {{ localeImpact.nextHref || localeImpact.nextPath || 'No public route' }}
          </span>
        </div>

        <div
          class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:sm:grid-cols-2"
        >
          <div>
            <div class="ginko:text-[10px] ginko:font-medium ginko:uppercase">Affected page</div>
            <div class="ginko:mt-0.5 ginko:truncate ginko:font-mono">
              {{ localeImpact.currentHref || localeImpact.currentPath || 'none' }} ->
              {{ localeImpact.nextHref || localeImpact.nextPath || 'none' }}
            </div>
          </div>
          <div>
            <div class="ginko:text-[10px] ginko:font-medium ginko:uppercase">
              Published website content
            </div>
            <div class="ginko:mt-0.5 ginko:flex ginko:flex-wrap ginko:gap-1">
              <Badge variant="outline" class="ginko:text-[10px]">
                Sitemap {{ localeImpact.sitemap.before ? 'in' : 'out' }}->{{
                  localeImpact.sitemap.after ? 'in' : 'out'
                }}
              </Badge>
              <Badge variant="outline" class="ginko:text-[10px]">
                Search {{ localeImpact.search.before ? 'in' : 'out' }}->{{
                  localeImpact.search.after ? 'in' : 'out'
                }}
              </Badge>
              <Badge variant="outline" class="ginko:text-[10px]">
                Nav {{ localeImpact.nav.before ? 'in' : 'out' }}->{{
                  localeImpact.nav.after ? 'in' : 'out'
                }}
              </Badge>
            </div>
          </div>
        </div>

        <div v-if="localeImpact.changes.length" class="ginko:mt-3 ginko:grid ginko:gap-1">
          <div
            v-for="change in localeImpact.changes"
            :key="`${localeImpact.locale}:${change.kind}:${change.label}`"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}:</span>
            {{ String(change.before ?? 'none') }} -> {{ String(change.after ?? 'none') }}
          </div>
        </div>

        <StudioWorkflowDiagnosticsList
          class="ginko:mt-3"
          :diagnostics="localeImpact.visibleBlockers"
          :hidden-count="localeImpact.hiddenBlockerCount"
          :item-key-prefix="`impact:${localeImpact.locale}:blocker`"
          more-label="blocker"
        />
        <StudioWorkflowDiagnosticsList
          class="ginko:mt-3"
          :diagnostics="localeImpact.visibleWarnings"
          :item-key-prefix="`impact:${localeImpact.locale}:warning`"
          more-label="warning"
        />
      </div>
    </div>
  </div>
</template>
