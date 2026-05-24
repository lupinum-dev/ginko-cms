<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { AlertCircle, CheckCircle2, FileArchive, Loader2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import {
  deriveImportRunResult,
  deriveImportRunsOverview,
  deriveImportRunSummary,
  formatImportIssue,
  importRunSourceLabel,
  importRunStatusVariant,
  type ImportRun,
} from '../lib/importRuns'

const { dateLocale } = useCmsI18n()
const { can } = useCmsStudioAccess()
const canManageCollections = can(cmsPermissionKeys.manageCollections)
const importRunsQuery = useCmsStudioQuery(
  api.ginkoCms.imports.listImportRuns,
  { limit: 30 },
  { requiredCapability: cmsPermissionKeys.manageCollections },
)
const runs = computed<ImportRun[]>(() => (importRunsQuery.data.value ?? []) as ImportRun[])
const overview = computed(() => deriveImportRunsOverview(runs.value))
const isLoading = computed(
  () => importRunsQuery.data.value === null && importRunsQuery.pending.value,
)
const pageError = computed(() =>
  importRunsQuery.error.value
    ? getCmsErrorMessage(importRunsQuery.error.value, 'Import runs could not be loaded.')
    : '',
)

const runResult = deriveImportRunResult
const runSummary = deriveImportRunSummary
const sourceLabel = importRunSourceLabel
const statusVariant = importRunStatusVariant
const formatIssue = formatImportIssue
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        title="Imports"
        eyebrow="Operations"
        description="Inspect filesystem-to-Ginko previews, applies, blockers, and public-output refreshes."
      >
        <template #actions>
          <Badge variant="outline" class="ginko:text-xs"> Code-defined collections </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-4 ginko:sm:p-5 ginko:lg:p-6">
        <div
          v-if="pageError"
          class="ginko:mb-4 ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-destructive/25 ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ pageError }}
        </div>

        <section
          class="ginko:mb-4 ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-4"
        >
          <div
            class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-4"
          >
            <div>
              <h2 class="ginko:text-sm ginko:font-medium">Import workflow</h2>
              <p
                class="ginko:mt-1 ginko:max-w-3xl ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
              >
                Filesystem imports run against the code-defined content model. Preview reports
                blockers and unmapped data; apply writes drafts; publish refreshes public output.
              </p>
            </div>
            <Badge variant="outline" class="ginko:text-xs">Inspector only</Badge>
          </div>
          <div class="ginko:mt-4 ginko:grid ginko:gap-2 ginko:sm:grid-cols-2 ginko:lg:grid-cols-5">
            <div
              class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
            >
              <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">Runs</div>
              <div class="ginko:text-lg ginko:font-semibold ginko:tabular-nums">
                {{ overview.totalRuns }}
              </div>
            </div>
            <div
              class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
            >
              <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                Preview / apply
              </div>
              <div class="ginko:text-lg ginko:font-semibold ginko:tabular-nums">
                {{ overview.previewRuns }} / {{ overview.applyRuns }}
              </div>
            </div>
            <div
              class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
            >
              <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                Blocked / failed
              </div>
              <div class="ginko:text-lg ginko:font-semibold ginko:tabular-nums">
                {{ overview.blockedRuns }} / {{ overview.failedRuns }}
              </div>
            </div>
            <div
              class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
            >
              <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                Warnings
              </div>
              <div class="ginko:text-lg ginko:font-semibold ginko:tabular-nums">
                {{ overview.totalWarnings }}
              </div>
            </div>
            <div
              class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
            >
              <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                Published entries
              </div>
              <div class="ginko:text-lg ginko:font-semibold ginko:tabular-nums">
                {{ overview.totalPublished }}
              </div>
            </div>
          </div>
          <p v-if="overview.latestRun" class="ginko:mt-3 ginko:text-xs ginko:text-muted-foreground">
            Latest run:
            <code class="ginko:font-mono ginko:text-foreground">{{
              overview.latestRun.importRunId
            }}</code>
            · {{ overview.latestRun.status || overview.latestRun.kind }}
          </p>
        </section>

        <div
          v-if="!canManageCollections && !pageError"
          class="ginko:mb-4 ginko:rounded-lg ginko:border ginko:border-dashed ginko:p-4 ginko:text-sm ginko:text-muted-foreground"
        >
          Import history requires collection-management access.
        </div>

        <div
          v-if="runs.length === 0 && isLoading"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            v-for="i in 6"
            :key="`import-run-skeleton-${i}`"
            class="ginko:px-4 ginko:py-4 ginko:space-y-3"
          >
            <div class="ginko:flex ginko:items-center ginko:gap-3">
              <Skeleton class="ginko:h-5 ginko:w-24 ginko:rounded-full" />
              <Skeleton class="ginko:h-4 ginko:w-40" />
            </div>
            <Skeleton class="ginko:h-4 ginko:w-2/3" />
          </div>
        </div>

        <StudioEmptyState
          v-else-if="runs.length === 0 && !isLoading && !pageError"
          title="No import runs yet"
          description="Preview or apply a filesystem import to create an inspectable run record."
        >
          <template #icon>
            <FileArchive class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <div v-else class="ginko:space-y-3">
          <article
            v-for="run in runs"
            :key="run._id"
            class="ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-4"
          >
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3"
            >
              <div class="ginko:min-w-0">
                <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                  <Badge :variant="statusVariant(run.status)" class="ginko:capitalize">
                    {{ run.status || run.kind }}
                  </Badge>
                  <Badge variant="outline" class="ginko:capitalize">
                    {{ run.kind }}
                  </Badge>
                  <Badge v-if="run.publish" variant="outline">publish</Badge>
                </div>
                <div
                  class="ginko:mt-2 ginko:font-mono ginko:text-xs ginko:text-muted-foreground ginko:truncate"
                >
                  {{ run.importRunId }}
                </div>
                <p class="ginko:mt-1 ginko:text-sm ginko:text-muted-foreground">
                  {{ sourceLabel(run) }}
                </p>
              </div>
              <div class="ginko:text-right ginko:text-xs ginko:text-muted-foreground">
                <NuxtTime
                  v-if="run.createdAt"
                  :datetime="run.createdAt"
                  :locale="dateLocale"
                  month="short"
                  day="numeric"
                  hour="2-digit"
                  minute="2-digit"
                />
                <div v-if="run.createdBy" class="ginko:mt-1 ginko:font-mono">
                  {{ run.createdBy }}
                </div>
              </div>
            </div>

            <div
              class="ginko:mt-4 ginko:grid ginko:gap-2 ginko:sm:grid-cols-2 ginko:lg:grid-cols-5"
            >
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                  Collections
                </div>
                <div class="ginko:text-sm ginko:font-medium">{{ run.collectionCount ?? 0 }}</div>
              </div>
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                  Entries
                </div>
                <div class="ginko:text-sm ginko:font-medium">{{ run.entryCount ?? 0 }}</div>
              </div>
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                  Assets
                </div>
                <div class="ginko:text-sm ginko:font-medium">{{ run.assetCount ?? 0 }}</div>
              </div>
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                  Blockers
                </div>
                <div class="ginko:text-sm ginko:font-medium">{{ runSummary(run).blockers }}</div>
              </div>
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-[11px] ginko:uppercase ginko:text-muted-foreground">
                  Published
                </div>
                <div class="ginko:text-sm ginko:font-medium">{{ runSummary(run).published }}</div>
              </div>
            </div>

            <div
              v-if="runResult(run).malformed"
              class="ginko:mt-4 ginko:rounded-md ginko:border ginko:border-destructive/30 ginko:bg-destructive/10 ginko:p-3 ginko:text-xs ginko:text-destructive-fg"
            >
              {{ runResult(run).malformed }}
            </div>

            <div class="ginko:mt-4 ginko:flex ginko:flex-wrap ginko:gap-1.5">
              <Badge
                v-for="slug in run.collectionSlugs || []"
                :key="`${run.importRunId}:${slug}`"
                variant="secondary"
                class="ginko:text-[10px]"
              >
                {{ slug }}
              </Badge>
            </div>

            <div class="ginko:mt-4 ginko:grid ginko:gap-3 ginko:lg:grid-cols-2">
              <section
                v-if="runResult(run).blockers.length"
                class="ginko:rounded-md ginko:border ginko:border-destructive/30 ginko:bg-destructive/5 ginko:p-3"
              >
                <h2
                  class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-xs ginko:font-medium ginko:text-destructive"
                >
                  <AlertCircle class="ginko:size-3.5" />
                  Blockers
                </h2>
                <ul
                  class="ginko:mt-2 ginko:space-y-1 ginko:text-xs ginko:leading-relaxed ginko:text-destructive"
                >
                  <li
                    v-for="(blocker, index) in runResult(run).blockers.slice(0, 6)"
                    :key="`${run.importRunId}:blocker:${index}`"
                  >
                    {{ formatIssue(blocker) }}
                  </li>
                </ul>
                <p
                  v-if="runResult(run).blockers.length > 6"
                  class="ginko:mt-2 ginko:text-xs ginko:text-destructive"
                >
                  +{{ runResult(run).blockers.length - 6 }} more blockers
                </p>
              </section>

              <section
                v-if="runResult(run).warnings.length"
                class="ginko:rounded-md ginko:border ginko:border-warning/25 ginko:bg-warning/10 ginko:p-3"
              >
                <h2 class="ginko:text-xs ginko:font-medium ginko:text-warning-fg">Warnings</h2>
                <ul
                  class="ginko:mt-2 ginko:space-y-1 ginko:text-xs ginko:leading-relaxed ginko:text-warning-fg"
                >
                  <li
                    v-for="(warning, index) in runResult(run).warnings.slice(0, 6)"
                    :key="`${run.importRunId}:warning:${index}`"
                  >
                    {{ formatIssue(warning) }}
                  </li>
                </ul>
                <p
                  v-if="runResult(run).warnings.length > 6"
                  class="ginko:mt-2 ginko:text-xs ginko:text-warning-fg"
                >
                  +{{ runResult(run).warnings.length - 6 }} more warnings
                </p>
              </section>

              <section
                v-if="runResult(run).entryChanges.length"
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3 ginko:lg:col-span-2"
              >
                <h2 class="ginko:text-xs ginko:font-medium">Previewed entry changes</h2>
                <div
                  class="ginko:mt-2 ginko:divide-y ginko:rounded-md ginko:border ginko:bg-background"
                >
                  <div
                    v-for="entry in runResult(run).entryChanges.slice(0, 8)"
                    :key="`${run.importRunId}:change:${entry.key}`"
                    class="ginko:px-3 ginko:py-2"
                  >
                    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                      <code class="ginko:text-[11px]">{{ entry.key }}</code>
                      <Badge variant="outline" class="ginko:text-[10px]">{{ entry.status }}</Badge>
                    </div>
                    <ul
                      v-if="entry.changes.length"
                      class="ginko:mt-1 ginko:space-y-0.5 ginko:text-xs ginko:text-muted-foreground"
                    >
                      <li
                        v-for="change in entry.changes.slice(0, 4)"
                        :key="`${entry.key}:${change}`"
                      >
                        {{ change }}
                      </li>
                    </ul>
                  </div>
                </div>
                <p
                  v-if="runResult(run).entryChanges.length > 8"
                  class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground"
                >
                  +{{ runResult(run).entryChanges.length - 8 }} more changed entries
                </p>
              </section>

              <section
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3"
              >
                <h2
                  class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-xs ginko:font-medium"
                >
                  <CheckCircle2 class="ginko:size-3.5 ginko:text-muted-foreground" />
                  Applied content
                </h2>
                <div class="ginko:mt-2 ginko:grid ginko:grid-cols-2 ginko:gap-2 ginko:text-xs">
                  <div class="ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1.5">
                    <div class="ginko:text-muted-foreground">Created drafts</div>
                    <div class="ginko:font-medium">{{ runResult(run).entryCreated.length }}</div>
                  </div>
                  <div class="ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1.5">
                    <div class="ginko:text-muted-foreground">Updated drafts</div>
                    <div class="ginko:font-medium">{{ runResult(run).entryUpdated.length }}</div>
                  </div>
                  <div class="ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1.5">
                    <div class="ginko:text-muted-foreground">Published</div>
                    <div class="ginko:font-medium">{{ runResult(run).published.length }}</div>
                  </div>
                  <div class="ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1.5">
                    <div class="ginko:text-muted-foreground">Skipped</div>
                    <div class="ginko:font-medium">{{ runResult(run).skipped.length }}</div>
                  </div>
                </div>
                <div
                  v-if="runResult(run).noops.length"
                  class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground"
                >
                  No-op entries: {{ runResult(run).noops.slice(0, 4).join(', ') }}
                  <span v-if="runResult(run).noops.length > 4">
                    +{{ runResult(run).noops.length - 4 }} more
                  </span>
                </div>
              </section>
            </div>

            <details
              class="ginko:mt-4 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30"
            >
              <summary
                class="ginko:cursor-pointer ginko:px-3 ginko:py-2 ginko:text-xs ginko:font-medium"
              >
                Import result JSON
              </summary>
              <pre class="ginko:max-h-80 ginko:overflow-auto ginko:px-3 ginko:pb-3 ginko:text-xs">{{
                JSON.stringify(run.result, null, 2)
              }}</pre>
            </details>
          </article>
        </div>

        <div
          v-if="isLoading && runs.length > 0"
          class="ginko:mt-4 ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm ginko:text-muted-foreground"
        >
          <Loader2 class="ginko:size-4 ginko:animate-spin" />
          Refreshing import runs
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
