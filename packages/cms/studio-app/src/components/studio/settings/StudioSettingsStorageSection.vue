<script setup lang="ts">
import {
  CircleCheck,
  FlaskConical,
  HardDrive,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
const st = (key: string, params?: Record<string, unknown>): string =>
  settings.t(`ginkoCms.studio.settingsPage.${key}`, params)
</script>

<template>
  <section
    v-if="settings.canManageSettings"
    class="ginko:flex ginko:flex-col ginko:gap-4 ginko:py-8 ginko:@3xl:flex-row ginko:@3xl:gap-10"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground">
        <HardDrive class="ginko:size-4 ginko:text-muted-foreground" />
        {{ st('storageTitle') }}
      </h2>
      <p class="ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
        {{ st('storageDescription') }}
      </p>
    </div>

    <div class="ginko:min-w-0 ginko:flex-1 ginko:space-y-4">
      <StudioNotice
        v-if="settings.storageError"
        tone="danger"
        :description="settings.storageError"
      />

      <div
        v-if="settings.storageHealth"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y"
      >
        <div
          class="ginko:flex ginko:flex-wrap ginko:items-center ginko:justify-between ginko:gap-3 ginko:px-4 ginko:py-3"
        >
          <div class="ginko:flex ginko:items-center ginko:gap-2">
            <CircleCheck
              v-if="settings.storageHealth.status === 'healthy'"
              class="ginko:size-4 ginko:text-success"
            />
            <TriangleAlert v-else class="ginko:size-4 ginko:text-warning" />
            <span class="ginko:text-sm ginko:font-medium">
              {{
                settings.storageHealth.status === 'healthy'
                  ? st('storageHealthy')
                  : st('storageAttention')
              }}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="settings.storageHealthQuery.pending.value"
            @click="settings.refreshStorageHealth"
          >
            <RefreshCw
              class="ginko:size-3.5"
              :class="{ 'ginko:animate-spin': settings.storageHealthQuery.pending.value }"
            />
            {{ st('storageRefresh') }}
          </Button>
        </div>

        <dl
          class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:px-4 ginko:py-4 ginko:@xl:grid-cols-2"
        >
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">
              {{ st('storageTrackedUsage') }}
            </dt>
            <dd class="ginko:mt-1 ginko:text-sm ginko:font-medium">
              {{ settings.formatBytes(settings.storageHealth.usage.trackedBytes) }} ·
              {{ st('storageAssetCount', { count: settings.storageHealth.usage.trackedAssets }) }}
            </dd>
          </div>
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">{{ st('storageQuota') }}</dt>
            <dd class="ginko:mt-1 ginko:text-sm ginko:font-medium">
              {{ st('storageQuotaProviderManaged') }}
            </dd>
          </div>
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">{{ st('storageBytesCheck') }}</dt>
            <dd class="ginko:mt-1 ginko:text-sm ginko:font-medium">
              {{
                st('storageBytesResult', {
                  checked: settings.storageHealth.bytes.checked,
                  missing: settings.storageHealth.bytes.missing,
                })
              }}
            </dd>
          </div>
          <div>
            <dt class="ginko:text-xs ginko:text-muted-foreground">
              {{ st('storageSupportedScale') }}
            </dt>
            <dd class="ginko:mt-1 ginko:text-sm ginko:font-medium">
              {{
                st('storageSupportedAssets', {
                  count: settings.storageHealth.constraints.supportedAssets,
                })
              }}
            </dd>
          </div>
        </dl>

        <div
          v-if="settings.storageHealth.issues.length"
          class="ginko:space-y-2 ginko:px-4 ginko:py-3"
        >
          <div
            v-for="issue in settings.storageHealth.issues"
            :key="issue.code"
            class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-sm"
          >
            <TriangleAlert class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-warning" />
            <span>{{ issue.message }}</span>
          </div>
        </div>
      </div>

      <div
        v-else
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
      >
        {{ st('storageHealthLoading') }}
      </div>

      <StudioNotice
        v-if="settings.storageDiagnostic"
        :tone="settings.storageDiagnostic.status === 'healthy' ? 'success' : 'danger'"
        :title="st(`storageDiagnosticStatus_${settings.storageDiagnostic.status}`)"
        :description="settings.storageDiagnostic.message"
      />

      <div
        class="ginko:flex ginko:flex-col ginko:items-start ginko:gap-2 ginko:@xl:flex-row ginko:@xl:items-center ginko:@xl:justify-between"
      >
        <p class="ginko:max-w-2xl ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
          {{ st('storageDiagnosticDescription') }}
        </p>
        <Button
          variant="outline"
          :disabled="settings.storageDiagnosticRunning"
          @click="settings.handleRunStorageDiagnostic"
        >
          <Loader2
            v-if="settings.storageDiagnosticRunning"
            class="ginko:size-4 ginko:animate-spin"
          />
          <FlaskConical v-else class="ginko:size-4" />
          {{ st('storageRunDiagnostic') }}
        </Button>
      </div>
    </div>
  </section>
</template>
