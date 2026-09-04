<script setup lang="ts">
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { statusToneClass, type StudioTranslationReadinessRow } from './studioWorkflowTypes'

defineProps<{
  currentLocale: string
  items: StudioTranslationReadinessRow[]
  saving: boolean
}>()

const emit = defineEmits<{
  review: [locale: string]
}>()

const { t } = useCmsI18n()
const ce = (key: string, params?: Record<string, unknown>): string =>
  t(`ginkoCms.studio.collectionEditor.${key}`, params)
</script>

<template>
  <section
    v-if="items.length"
    class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-4"
  >
    <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
      <div>
        <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground ginko:uppercase">
          {{ ce('translationReadinessLanguageStatus') }}
        </div>
        <div class="ginko:mt-1 ginko:text-sm ginko:font-medium">
          {{ ce('translationReadinessOtherVersions') }}
        </div>
        <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
          {{ ce('translationReadinessCheckDrafts') }}
        </div>
      </div>
      <Badge variant="outline">{{
        ce('translationReadinessCurrentBadge', { locale: currentLocale })
      }}</Badge>
    </div>

    <div class="ginko:mt-3 ginko:grid ginko:gap-3 ginko:@2xl:grid-cols-2">
      <div
        v-for="localeState in items"
        :key="`translation-readiness:${localeState.locale}`"
        class="ginko:rounded-md ginko:border ginko:bg-background ginko:p-3"
      >
        <div
          class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-2"
        >
          <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2">
            <Badge variant="outline" class="ginko:text-xs ginko:font-mono">
              {{ localeState.locale }}
            </Badge>
            <span class="ginko:text-sm ginko:font-medium">{{ localeState.label }}</span>
          </div>
          <Badge variant="outline" :class="statusToneClass(localeState.status)">
            {{ localeState.impactLabel }}
          </Badge>
        </div>

        <div class="ginko:mt-3 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground">
          <div class="ginko:grid ginko:grid-cols-[7rem_minmax(0,1fr)] ginko:gap-2">
            <span class="ginko:font-medium ginko:text-foreground">{{
              ce('translationReadinessDraft')
            }}</span>
            <span>{{
              localeState.exists
                ? ce('translationReadinessExists')
                : ce('translationReadinessMissing')
            }}</span>
          </div>
          <div class="ginko:grid ginko:grid-cols-[7rem_minmax(0,1fr)] ginko:gap-2">
            <span class="ginko:font-medium ginko:text-foreground">{{
              ce('translationReadinessLiveStatus')
            }}</span>
            <span>{{
              localeState.published
                ? ce('translationReadinessLive')
                : ce('translationReadinessNotLive')
            }}</span>
          </div>
          <div class="ginko:grid ginko:grid-cols-[7rem_minmax(0,1fr)] ginko:gap-2">
            <span class="ginko:font-medium ginko:text-foreground">{{
              ce('translationReadinessUrl')
            }}</span>
            <span class="ginko:truncate ginko:font-mono">
              {{
                localeState.draftPath ||
                (localeState.missingRoute
                  ? ce('translationReadinessUrlMissing')
                  : ce('translationReadinessUrlNone'))
              }}
            </span>
          </div>
          <div class="ginko:grid ginko:grid-cols-[7rem_minmax(0,1fr)] ginko:gap-2">
            <span class="ginko:font-medium ginko:text-foreground">{{
              ce('translationReadinessMissingLabel')
            }}</span>
            <span>
              {{
                localeState.missingFields.length
                  ? localeState.missingFields.join(', ')
                  : ce('translationReadinessNone')
              }}
            </span>
          </div>
        </div>

        <div
          v-if="localeState.parentBlocked"
          class="ginko:mt-2 ginko:text-xs ginko:text-destructive"
        >
          {{ ce('translationReadinessParentBlocking') }}
        </div>

        <div
          v-if="
            !localeState.exists ||
            localeState.missingRoute ||
            localeState.parentBlocked ||
            localeState.missingFields.length
          "
          class="ginko:mt-3 ginko:flex ginko:flex-wrap ginko:gap-1"
        >
          <Badge
            v-if="!localeState.exists"
            variant="outline"
            class="ginko:border-warning/40 ginko:text-warning-fg ginko:text-xs"
          >
            {{ ce('translationReadinessMissingLanguage') }}
          </Badge>
          <Badge
            v-if="localeState.missingRoute"
            variant="outline"
            class="ginko:border-destructive/40 ginko:text-destructive ginko:text-xs"
          >
            {{ ce('translationReadinessMissingUrl') }}
          </Badge>
          <Badge
            v-if="localeState.parentBlocked"
            variant="outline"
            class="ginko:border-destructive/40 ginko:text-destructive ginko:text-xs"
          >
            {{ ce('translationReadinessParentBlocked') }}
          </Badge>
          <Badge
            v-if="localeState.missingFields.length"
            variant="outline"
            class="ginko:border-destructive/40 ginko:text-destructive ginko:text-xs"
          >
            {{ ce('translationReadinessMissingFields') }}
          </Badge>
        </div>

        <div
          class="ginko:mt-3 ginko:rounded-md ginko:bg-muted/40 ginko:px-3 ginko:py-2 ginko:text-xs"
        >
          <div class="ginko:font-medium ginko:text-foreground">
            {{ ce('translationReadinessNextAction') }}
          </div>
          <div class="ginko:mt-1 ginko:text-muted-foreground">
            {{ localeState.suggestedAction }}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="ginko:mt-3 ginko:h-8 ginko:text-xs"
          :disabled="saving"
          @click="emit('review', localeState.locale)"
        >
          {{ ce('translationReadinessReviewLanguage') }}
        </Button>
      </div>
    </div>
  </section>
</template>
