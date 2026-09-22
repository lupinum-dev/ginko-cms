<script setup lang="ts">
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'
import {
  mapEntryReadinessDetail,
  readinessIssueMessage,
  readinessStateTone,
} from '../../../lib/publicWorkflow'
import type { StudioEntryReadinessDetail } from './studioWorkflowTypes'

const props = defineProps<{
  readinessDetail?: StudioEntryReadinessDetail | null
  readinessPending?: boolean
}>()
const editor = useStudioEntryEditorContext()
const readinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: props.readinessDetail,
    currentLocale: editor.loader.currentLocale,
    t: editor.loader.t,
    publishMode: 'single',
  }),
)
const blockers = computed(() =>
  (props.readinessDetail?.locales ?? []).flatMap((row) =>
    row.blockers.map((issue) => ({
      key: `${row.locale}:${issue.code}:${issue.fieldPath ?? ''}`,
      message: `${contentLanguageLabel(row.locale, editor.loader.locales, editor.loader.dateLocale)}: ${readinessIssueMessage(editor.loader.t, issue)}`,
    })),
  ),
)
</script>

<template>
  <div class="ginko:grid ginko:gap-2" :aria-busy="readinessPending">
    <p v-if="readinessPending" class="ginko:text-sm ginko:text-muted-foreground">
      {{ editor.loader.t('ginkoCms.studio.entryDetails.statusChecking') }}
    </p>
    <Button
      v-for="row in readinessView.languageRows"
      :key="row.locale"
      variant="ghost"
      class="ginko:h-auto ginko:min-h-10 ginko:w-full ginko:justify-between ginko:gap-2 ginko:whitespace-normal ginko:px-2"
      @click="editor.locales.handleSwitchLocale(row.locale)"
    >
      <span class="ginko:text-left">{{
        contentLanguageLabel(row.locale, editor.loader.locales, editor.loader.dateLocale)
      }}</span>
      <StudioStatusPill
        :label="row.status"
        :tone="readinessStateTone(row.state, { blocked: row.blocked })"
      />
    </Button>
    <p v-for="issue in blockers" :key="issue.key" class="ginko:text-xs ginko:text-warning-fg">
      {{ issue.message }}
    </p>
  </div>
</template>
