<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import StudioLocaleVisibilityRow from './StudioLocaleVisibilityRow.vue'
import StudioPublishImpactSummary from './StudioPublishImpactSummary.vue'
import StudioWorkflowDiagnosticsList from './StudioWorkflowDiagnosticsList.vue'
import {
  statusToneClass,
  type StudioPublicVisibilityState,
  type StudioPublishImpactState,
  type StudioPublishReviewState,
  type StudioRouteValidationState,
} from './studioWorkflowTypes'

const props = withDefaults(
  defineProps<{
    publicVisibility: StudioPublicVisibilityState
    routeValidationRequested: boolean
    routeValidationState: StudioRouteValidationState
    publishImpactRequested: boolean
    publishImpact: StudioPublishImpactState
    previewScope: 'publish' | 'workflow' | null
    publishReview: StudioPublishReviewState
    selectedPublishImpactLocale: string | null
    showPublishImpactSummary?: boolean
  }>(),
  {
    showPublishImpactSummary: true,
  },
)

const publicOutputSummary = computed(() => {
  const localeCount = props.publicVisibility.localeRows.length
  const publishedCount = props.publicVisibility.publishedLocales.length
  const blockedCount = props.publicVisibility.localeRows.filter(
    (row) =>
      row.missingRequiredFields.length ||
      row.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  ).length

  return {
    blockedCount,
    localeCount,
    publishedCount,
  }
})

const emit = defineEmits<{
  previewPublishImpact: []
  validatePublicRoutes: []
}>()
const advancedEditor = useStudioAdvancedEditor()

const { t } = useCmsI18n()
const ce = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.collectionEditor.${key}`, params)
</script>

<template>
  <section class="ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-5">
    <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
      <div class="ginko:min-w-0">
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          {{ ce('publicWorkflowPublishReadiness') }}
        </div>
        <div class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
          <span class="ginko:text-sm ginko:font-medium">{{ publicVisibility.status }}</span>
          <Badge :variant="publicVisibility.isRouteBacked ? 'secondary' : 'outline'">
            {{ publicVisibility.isRouteBacked ? ce('publicWorkflowWebsitePages') : ce('publicWorkflowSharedData') }}
          </Badge>
          <Badge
            v-if="publishImpactRequested && previewScope === 'publish'"
            variant="outline"
            :class="statusToneClass(publishReview.state)"
          >
            {{ publishReview.label }}
          </Badge>
        </div>
      </div>

      <div class="ginko:flex ginko:flex-wrap ginko:gap-2">
        <Button
          variant="outline"
          size="sm"
          class="ginko:h-8 ginko:text-xs"
          @click="emit('previewPublishImpact')"
        >
          {{ ce('publicWorkflowWhatWillChange') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="ginko:h-8 ginko:text-xs"
          :disabled="!publicVisibility.isRouteBacked"
          @click="emit('validatePublicRoutes')"
        >
          {{ ce('publicWorkflowCheckLinks') }}
        </Button>
      </div>
    </div>

    <div
      v-if="publicVisibility.pending"
      class="ginko:mt-3 ginko:text-xs ginko:text-muted-foreground"
    >
      {{ ce('publicWorkflowCheckingLiveContent') }}
    </div>
    <div v-else-if="publicVisibility.error" class="ginko:mt-3 ginko:text-xs ginko:text-destructive">
      {{ publicVisibility.errorMessage }}
    </div>
    <div v-else class="ginko:mt-3 ginko:grid ginko:gap-3">
      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3">
        <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
          <div>
            <div
              class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase"
            >
              {{ ce('publicWorkflowLiveContent') }}
            </div>
            <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{
                publicVisibility.isRouteBacked
                  ? ce('publicWorkflowRouteBackedHint')
                  : ce('publicWorkflowSharedDataHint')
              }}
            </p>
          </div>
          <Badge variant="outline" class="ginko:text-xs">
            {{ publicVisibility.isRouteBacked ? ce('publicWorkflowWebsitePages') : ce('publicWorkflowSharedData') }}
          </Badge>
        </div>
        <div class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:sm:grid-cols-3">
          <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
            <div class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
              {{ ce('publicWorkflowLanguagesChecked') }}
            </div>
            <div class="ginko:text-sm ginko:font-medium ginko:tabular-nums">
              {{ publicOutputSummary.localeCount }}
            </div>
          </div>
          <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
            <div class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
              {{ ce('publicWorkflowLiveLanguages') }}
            </div>
            <div class="ginko:text-sm ginko:font-medium ginko:tabular-nums">
              {{ publicOutputSummary.publishedCount }}
            </div>
          </div>
          <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
            <div class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
              {{ ce('publishDialogIssuesBlocking') }}
            </div>
            <div class="ginko:text-sm ginko:font-medium ginko:tabular-nums">
              {{ publicOutputSummary.blockedCount }}
            </div>
          </div>
        </div>
      </div>
      <StudioWorkflowDiagnosticsList
        :diagnostics="publicVisibility.globalDiagnostics.slice(0, 4)"
        :hidden-count="publicVisibility.hiddenGlobalDiagnosticCount"
        item-key-prefix="visibility-global"
        more-label-key="GlobalDiagnostic"
      />
      <StudioLocaleVisibilityRow
        v-for="localeState in publicVisibility.localeRows"
        :key="localeState.locale"
        :locale-state="localeState"
      />
      <div
        v-if="publicVisibility.localeRows.length === 0"
        class="ginko:rounded-md ginko:border ginko:bg-background ginko:p-3 ginko:text-xs ginko:text-muted-foreground"
      >
        {{ ce('publicWorkflowNoLanguageRows') }}
      </div>
    </div>

    <div
      class="ginko:mt-3 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3"
    >
      <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2">
        <div>
          <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
            {{ ce('publicWorkflowLinkChecks') }}
          </div>
          <div
            class="ginko:mt-1 ginko:text-xs"
            :class="
              routeValidationState.state === 'error' || routeValidationState.state === 'missing'
                ? 'ginko:text-destructive'
                : 'ginko:text-muted-foreground'
            "
          >
            {{
              routeValidationRequested
                ? routeValidationState.message
                : ce('publicWorkflowRunValidation')
            }}
          </div>
        </div>
        <Badge
          variant="outline"
          :class="routeValidationRequested ? statusToneClass(routeValidationState.state) : ''"
        >
          {{ routeValidationRequested ? routeValidationState.state : ce('publicWorkflowNotRun') }}
        </Badge>
      </div>

      <StudioWorkflowDiagnosticsList
        class="ginko:mt-3"
        :diagnostics="routeValidationState.diagnostics"
        :hidden-count="routeValidationState.hiddenDiagnosticCount"
        item-key-prefix="route-validation"
        more-label-key="UrlIssue"
      />
    </div>

    <StudioPublishImpactSummary
      v-if="showPublishImpactSummary && publishImpactRequested"
      class="ginko:mt-3"
      :preview-scope="previewScope"
      :publish-impact="publishImpact"
      :publish-review="publishReview"
      :show-developer-diagnostics="advancedEditor"
      :selected-publish-impact-locale="selectedPublishImpactLocale"
    />
  </section>
</template>
