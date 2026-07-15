<script setup lang="ts">
import { Loader2, RadioTower, RefreshCw, RotateCcw, ShieldCheck } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'
import { websiteRefreshStatusLabel } from '../../../lib/publicWorkflow'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
const st = (key: string, params?: Record<string, unknown>): string =>
  settings.t(`ginkoCms.studio.settingsPage.${key}`, params)
</script>

<template>
  <!-- ─── Website refresh ─── -->
  <section
    v-if="settings.canManageSettings"
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <RadioTower class="ginko:size-4 ginko:text-muted-foreground" />
        {{ st('revalidationTitle') }}
        <Badge variant="outline" class="ginko:text-xs">
          {{ settings.revalidationJobs.length }}
        </Badge>
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ st('revalidationDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <StudioNotice
        v-if="settings.revalidationError"
        tone="danger"
        :description="settings.revalidationError"
      />

      <StudioNotice
        v-if="settings.revalidationInfo"
        tone="success"
        :description="settings.revalidationInfo"
      />

      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          v-if="settings.revalidationTargets.length === 0"
          class="ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
        >
          {{ st('revalidationNoTarget') }}
        </div>
        <div
          v-for="target in settings.revalidationTargets"
          :key="target.id"
          class="ginko:px-4 ginko:py-3 ginko:space-y-2"
        >
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <div class="ginko:min-w-0">
              <div class="ginko:flex ginko:items-center ginko:gap-2">
                <span class="ginko:text-sm ginko:font-medium ginko:truncate">{{
                  target.name
                }}</span>
                <Badge :variant="target.enabled ? 'default' : 'secondary'" class="ginko:text-xs">
                  {{ target.enabled ? st('revalidationEnabled') : st('revalidationDisabled') }}
                </Badge>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ target.environment }}
                </Badge>
              </div>
              <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
                {{ st('revalidationUpdated', { time: settings.formatTimestamp(target.updatedAt) }) }}
              </div>
            </div>
            <ShieldCheck class="ginko:size-4 ginko:text-muted-foreground ginko:shrink-0" />
          </div>
          <StudioDeveloperDetails>
            <div class="ginko:space-y-2">
              <div class="ginko:text-xs ginko:text-muted-foreground">{{ st('revalidationEndpoint') }}</div>
              <code
                class="ginko:block ginko:break-all ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1 ginko:font-mono ginko:text-xs"
                >{{ target.endpoint }}</code
              >
              <div class="ginko:text-xs ginko:text-muted-foreground">{{ st('revalidationSecretEnv') }}</div>
              <code
                class="ginko:block ginko:break-all ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1 ginko:font-mono ginko:text-xs"
                >{{ target.secretEnv }}</code
              >
            </div>
          </StudioDeveloperDetails>
        </div>
      </div>

      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          class="ginko:px-4 ginko:py-3 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3"
        >
          <div class="ginko:text-sm ginko:font-medium">{{ st('revalidationRecent') }}</div>
          <Button
            variant="outline"
            size="sm"
            :disabled="settings.revalidationJobsQuery.pending.value"
            @click="settings.refreshRevalidationJobs"
          >
            <RefreshCw
              class="ginko:size-3.5"
              :class="{ 'ginko:animate-spin': settings.revalidationJobsQuery.pending.value }"
            />
            {{ st('storageRefresh') }}
          </Button>
        </div>
        <div
          v-if="settings.revalidationJobs.length === 0"
          class="ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
        >
          {{ st('revalidationNoJobs') }}
        </div>
        <div
          v-for="job in settings.revalidationJobs"
          :key="job.id"
          class="ginko:px-4 ginko:py-3 ginko:space-y-3"
        >
          <div
            class="ginko:flex ginko:flex-col ginko:gap-3 ginko:md:flex-row ginko:md:items-start ginko:md:justify-between"
          >
            <div class="ginko:min-w-0 ginko:space-y-1">
              <div class="ginko:flex ginko:items-center ginko:gap-2 ginko:min-w-0">
                <Badge
                  :variant="job.status === 'failed' ? 'destructive' : 'secondary'"
                  class="ginko:text-xs"
                >
                  {{ websiteRefreshStatusLabel(settings.t, job.status) }}
                </Badge>
                <span class="ginko:text-xs ginko:text-muted-foreground">
                  {{
                    job.paths.length === 1
                      ? st('revalidationPagesOne', { count: job.paths.length })
                      : st('revalidationPagesOther', { count: job.paths.length })
                  }}
                </span>
              </div>
              <div class="ginko:text-xs ginko:text-muted-foreground">
                {{ settings.formatRevalidationReason(job) }} ·
                {{
                  job.attempts === 1
                    ? st('revalidationAttemptsOne', { count: job.attempts })
                    : st('revalidationAttemptsOther', { count: job.attempts })
                }}
                · {{ st('revalidationNext') }} {{ settings.formatTimestamp(job.nextAttemptAt) }}
              </div>
            </div>
            <Button
              v-if="job.status === 'failed'"
              variant="outline"
              size="sm"
              :disabled="settings.retryingRevalidationJobId === job.id"
              @click="settings.handleRetryRevalidationJob(job.id)"
            >
              <Loader2
                v-if="settings.retryingRevalidationJobId === job.id"
                class="ginko:size-3.5 ginko:animate-spin"
              />
              <RotateCcw v-else class="ginko:size-3.5" />
              {{ st('revalidationRetry') }}
            </Button>
          </div>
          <div
            v-if="job.lastError"
            class="ginko:rounded-md ginko:bg-destructive/10 ginko:dark:bg-destructive/15 ginko:text-destructive-fg ginko:text-xs ginko:px-3 ginko:py-2"
          >
            {{ job.lastError }}
          </div>
          <StudioDeveloperDetails>
            <div
              class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:text-xs ginko:md:grid-cols-2"
            >
              <div class="ginko:min-w-0">
                <div class="ginko:mb-1 ginko:text-muted-foreground">{{ st('revalidationJobId') }}</div>
                <div class="ginko:break-all ginko:font-mono">{{ job.id }}</div>
              </div>
              <div class="ginko:min-w-0">
                <div class="ginko:mb-1 ginko:text-muted-foreground">{{ st('revalidationPaths') }}</div>
                <div class="ginko:break-all ginko:font-mono">
                  {{ job.paths.length ? job.paths.join(', ') : st('revalidationNone') }}
                </div>
              </div>
              <div class="ginko:min-w-0 ginko:md:col-span-2">
                <div class="ginko:mb-1 ginko:text-muted-foreground">{{ st('revalidationTags') }}</div>
                <div class="ginko:break-all ginko:font-mono">
                  {{ job.tags.length ? job.tags.join(', ') : st('revalidationNone') }}
                </div>
              </div>
            </div>
          </StudioDeveloperDetails>
        </div>
      </div>
    </div>
  </section>
</template>
