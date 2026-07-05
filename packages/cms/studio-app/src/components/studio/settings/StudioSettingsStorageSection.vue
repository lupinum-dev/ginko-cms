<script setup lang="ts">
import { AlertCircle, Database, RefreshCw } from 'lucide-vue-next'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Storage hygiene ─── -->
  <section
    v-if="settings.canManageSettings"
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Database class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.storageHygiene') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.storageHygieneDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div class="ginko:rounded-lg ginko:border ginko:border-border/40">
        <div
          class="ginko:flex ginko:flex-col ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3 ginko:sm:flex-row ginko:sm:items-center ginko:sm:justify-between"
        >
          <div class="ginko:min-w-0">
            <div class="ginko:text-sm ginko:font-medium">
              {{ settings.t('ginkoCms.studio.settingsPage.storageFootprint') }}
            </div>
            <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{
                settings.storageHygiene
                  ? settings.t('ginkoCms.studio.settingsPage.storageScanLimit', {
                      count: String(settings.storageHygiene.scanLimit),
                    })
                  : settings.t('ginkoCms.studio.settingsPage.storageLoading')
              }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="settings.storageHygieneQuery.pending.value"
            @click="settings.refreshStorageHygiene"
          >
            <RefreshCw
              class="ginko:size-3.5"
              :class="{ 'animate-spin': settings.storageHygieneQuery.pending.value }"
            />
            {{ settings.t('ginkoCms.studio.settingsPage.storageRefresh') }}
          </Button>
        </div>

        <div
          v-if="settings.storageHygieneQuery.error.value"
          class="ginko:flex ginko:items-center ginko:gap-2 ginko:px-4 ginko:py-4 ginko:text-sm ginko:text-destructive"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ settings.t('ginkoCms.studio.settingsPage.storageLoadError') }}
        </div>

        <div
          v-else-if="!settings.storageHygiene"
          class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:p-4 ginko:sm:grid-cols-2"
        >
          <Skeleton
            v-for="i in 6"
            :key="`storage-skeleton-${i}`"
            class="ginko:h-10 ginko:rounded-md"
          />
        </div>

        <div v-else class="ginko:space-y-4 ginko:p-4">
          <div
            v-if="settings.storageHygiene.truncatedTables.length"
            class="ginko:rounded-md ginko:bg-warning/15 ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-warning-fg"
          >
            {{
              settings.t('ginkoCms.studio.settingsPage.storageTruncated', {
                tables: settings.storageHygiene.truncatedTables.join(', '),
              })
            }}
          </div>

          <div class="ginko:grid ginko:grid-cols-1 ginko:gap-x-4 ginko:sm:grid-cols-2">
            <div
              v-for="row in settings.storageHygieneRows"
              :key="row.label"
              class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-4 ginko:border-b ginko:border-border/30 ginko:py-2 ginko:text-sm"
            >
              <span class="ginko:text-muted-foreground">{{ row.label }}</span>
              <span class="ginko:font-mono ginko:text-xs ginko:text-foreground">{{
                row.value
              }}</span>
            </div>
          </div>

          <div class="ginko:space-y-2">
            <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
              {{ settings.t('ginkoCms.studio.settingsPage.storageGrowthRisks') }}
            </div>
            <div class="ginko:space-y-2">
              <div
                v-for="risk in settings.storageRiskRows"
                :key="risk.label"
                class="ginko:rounded-md ginko:bg-muted/30 ginko:px-3 ginko:py-2"
              >
                <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
                  {{ risk.label }}
                </div>
                <div class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                  {{ risk.detail }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
