<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { AlertCircle, Ban, Bot, Clock, Loader2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useConvexMutation } from '../composables/useStudioConvex'

type AgentRun = {
  _id: string
  credentialApiKeyId: string | null
  delegatedUserId: string
  requestedScopes: string[]
  safetyMode: 'human' | 'review-gated' | 'credential-missing'
  taskName: string
  status: 'active' | 'completed' | 'revoked' | 'failed'
  createdBy: string
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  endedAt: number | null
  lastWriteAt: number | null
  lastError: string | null
}

const { t, dateLocale } = useCmsI18n()
const { ready, can } = useCmsStudioAccess()
const canManageSettings = can(cmsPermissionKeys.manageSettings)
const runsQuery = useCmsStudioQuery(
  api.ginkoCms.agentRuns.listOwnRuns,
  { limit: 50 },
  { requiredCapability: cmsPermissionKeys.manageSettings },
)
const revokeRunMutation = useConvexMutation(api.ginkoCms.agentRuns.revokeRun)
const runs = computed<AgentRun[]>(() => (runsQuery.data.value ?? []) as AgentRun[])
const activeRuns = computed(() => runs.value.filter((run) => run.status === 'active').length)
const isLoading = computed(() => runsQuery.data.value === null && runsQuery.pending.value)
const revokingRunId = ref<string | null>(null)
const revokeError = ref('')
const pageError = computed(() =>
  runsQuery.error.value
    ? getCmsErrorMessage(runsQuery.error.value, t('ginkoCms.studio.agentsPage.loadError'))
    : '',
)

function statusVariant(status: AgentRun['status']) {
  if (status === 'active') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'revoked') return 'warning'
  return 'soft'
}

function shortId(value: string | null): string {
  if (!value) return '-'
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function safetyLabel(mode: AgentRun['safetyMode']) {
  if (mode === 'review-gated') return 'review gated'
  if (mode === 'credential-missing') return 'credential missing'
  return 'human'
}

function scopeSummary(scopes: string[]) {
  if (scopes.length === 0) return 'no scopes'
  if (scopes.length <= 2) return scopes.join(', ')
  return `${scopes.length} scopes`
}

async function revokeRun(run: AgentRun) {
  revokeError.value = ''
  revokingRunId.value = run._id
  try {
    await revokeRunMutation({ agentRunId: run._id })
    await runsQuery.refresh()
  } catch (error) {
    revokeError.value = getCmsErrorMessage(error, 'Failed to revoke agent run.')
  } finally {
    revokingRunId.value = null
  }
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.agentsPage.title')"
        :eyebrow="t('ginkoCms.studio.layout.operations')"
        :description="t('ginkoCms.studio.agentsPage.description')"
      >
        <template #actions>
          <Badge variant="outline" class="ginko:text-xs"> {{ activeRuns }} active </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-4 ginko:sm:p-5 ginko:lg:p-6">
        <div
          v-if="pageError || revokeError"
          class="ginko:mb-4 ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-destructive/25 ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ pageError || revokeError }}
        </div>

        <StudioEmptyState
          v-if="ready && !canManageSettings"
          :title="t('ginkoCms.studio.agentsPage.accessRequired')"
          :description="t('ginkoCms.studio.agentsPage.accessRequiredDescription')"
        >
          <template #icon>
            <Bot class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <div
          v-else-if="runs.length === 0 && isLoading"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            v-for="i in 5"
            :key="`agent-run-skeleton-${i}`"
            class="ginko:border-b ginko:border-border/60 ginko:p-4 ginko:last:border-b-0"
          >
            <Skeleton class="ginko:h-5 ginko:w-56" />
            <Skeleton class="ginko:mt-3 ginko:h-4 ginko:w-3/4" />
            <Skeleton class="ginko:mt-4 ginko:h-4 ginko:w-1/2" />
          </div>
        </div>

        <StudioEmptyState
          v-else-if="runs.length === 0 && !isLoading && !pageError"
          :title="t('ginkoCms.studio.agentsPage.empty')"
          :description="t('ginkoCms.studio.agentsPage.emptyDescription')"
        >
          <template #icon>
            <Bot class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <div
          v-else
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            class="ginko:hidden ginko:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-[11px] ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:md:grid"
          >
            <div>Run</div>
            <div>Last write</div>
            <div class="ginko:text-right">Started</div>
            <div class="ginko:text-right">Action</div>
          </div>

          <article
            v-for="run in runs"
            :key="run._id"
            class="ginko:grid ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:last:border-b-0 ginko:md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] ginko:md:items-center"
          >
            <div class="ginko:min-w-0">
              <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                <Badge :variant="statusVariant(run.status)" class="ginko:capitalize">
                  {{ run.status }}
                </Badge>
                <span class="ginko:truncate ginko:text-sm ginko:font-medium">
                  {{ run.taskName }}
                </span>
              </div>
              <div
                class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
              >
                <span class="ginko:font-mono">{{ shortId(run._id) }}</span>
                <span v-if="run.credentialApiKeyId" class="ginko:font-mono">
                  key {{ shortId(run.credentialApiKeyId) }}
                </span>
              </div>
              <div
                class="ginko:mt-1 ginko:flex ginko:flex-wrap ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
              >
                <span>user {{ shortId(run.delegatedUserId) }}</span>
                <span>{{ safetyLabel(run.safetyMode) }}</span>
                <span>{{ scopeSummary(run.requestedScopes) }}</span>
                <span v-if="run.expiresAt">
                  expires
                  <NuxtTime
                    :datetime="run.expiresAt"
                    :locale="dateLocale"
                    month="short"
                    day="numeric"
                    hour="2-digit"
                    minute="2-digit"
                  />
                </span>
              </div>
              <p v-if="run.lastError" class="ginko:mt-1 ginko:text-xs ginko:text-destructive">
                {{ run.lastError }}
              </p>
            </div>

            <div
              class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-muted-foreground"
            >
              <Clock class="ginko:size-3.5" />
              <NuxtTime
                v-if="run.lastWriteAt"
                :datetime="run.lastWriteAt"
                :locale="dateLocale"
                month="short"
                day="numeric"
                hour="2-digit"
                minute="2-digit"
              />
              <span v-else>None</span>
            </div>

            <div
              class="ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground ginko:md:text-right"
            >
              <NuxtTime
                :datetime="run.createdAt"
                :locale="dateLocale"
                month="short"
                day="numeric"
                hour="2-digit"
                minute="2-digit"
              />
            </div>

            <div class="ginko:flex ginko:justify-start ginko:md:justify-end">
              <Button
                v-if="run.status === 'active'"
                variant="outline"
                size="sm"
                class="ginko:h-8 ginko:text-xs"
                :disabled="revokingRunId === run._id"
                @click="revokeRun(run)"
              >
                <Loader2
                  v-if="revokingRunId === run._id"
                  class="ginko:size-3.5 ginko:animate-spin"
                />
                <Ban v-else class="ginko:size-3.5" />
                Revoke
              </Button>
            </div>
          </article>
        </div>

        <div v-if="isLoading && runs.length > 0" class="ginko:flex ginko:justify-center ginko:py-4">
          <Loader2 class="ginko:size-4 ginko:animate-spin ginko:text-muted-foreground" />
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
