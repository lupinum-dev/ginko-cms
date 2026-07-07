<script setup lang="ts">
import { AlertCircle, Languages, Loader2, Plus, X } from 'lucide-vue-next'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Languages ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
  >
    <!-- Left: label column -->
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <Languages class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.locales') }}
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.localesDescription') }}
      </p>
    </div>

    <!-- Right: content column -->
    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div
        v-if="settings.localeError"
        class="ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
      >
        <AlertCircle class="ginko:size-4 ginko:shrink-0" />
        {{ settings.localeError }}
      </div>

      <div v-if="settings.settingsQuery.error?.value" class="ginko:text-sm ginko:text-destructive">
        {{ settings.t('ginkoCms.studio.settingsPage.loadError') }}
      </div>

      <!-- Empty state -->
      <StudioEmptyState
        v-if="settings.locales.length === 0 && settings.canManageSettings"
        :title="settings.t('ginkoCms.studio.settingsPage.noLocales')"
        :description="settings.t('ginkoCms.studio.settingsPage.noLocalesDescription')"
      >
        <template #icon>
          <Languages class="ginko:size-5" aria-hidden="true" />
        </template>
      </StudioEmptyState>

      <div
        v-else-if="settings.locales.length === 0"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-4 ginko:text-sm ginko:text-muted-foreground"
      >
        {{ settings.t('ginkoCms.studio.settingsPage.noLocales') }}
      </div>

      <!-- Locale rows -->
      <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          v-for="(locale, index) in settings.locales"
          :key="`${locale.code || 'new'}-${index}`"
          class="ginko:p-4"
        >
          <div
            v-if="settings.canManageSettings"
            class="ginko:grid ginko:grid-cols-[5rem_1fr_1fr_auto] ginko:gap-3 ginko:items-end"
          >
            <div class="ginko:space-y-1.5">
              <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                settings.t('ginkoCms.common.code')
              }}</Label>
              <Input
                v-model="locale.code"
                class="ginko:h-8 ginko:text-sm ginko:font-mono"
                :placeholder="settings.t('ginkoCms.studio.settingsPage.localeCodePlaceholder')"
              />
            </div>
            <div class="ginko:space-y-1.5">
              <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                settings.t('ginkoCms.common.label')
              }}</Label>
              <Input
                v-model="locale.label"
                class="ginko:h-8 ginko:text-sm"
                :placeholder="settings.t('ginkoCms.studio.settingsPage.localeLabelPlaceholder')"
              />
            </div>
            <div class="ginko:space-y-1.5">
              <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                settings.t('ginkoCms.common.fallback')
              }}</Label>
              <Select
                :model-value="locale.fallback || '__none__'"
                @update:model-value="locale.fallback = $event === '__none__' ? '' : $event"
              >
                <SelectTrigger class="ginko:h-8 ginko:text-xs ginko:font-mono">
                  <SelectValue :placeholder="settings.t('ginkoCms.common.none')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {{ settings.t('ginkoCms.common.none') }}
                  </SelectItem>
                  <SelectItem
                    v-for="other in settings.locales.filter(
                      (l) => l.code && l.code !== locale.code,
                    )"
                    :key="other.code"
                    :value="other.code"
                  >
                    {{ other.code }}{{ other.label ? ` (${other.label})` : '' }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="ginko:flex ginko:items-center ginko:gap-2 ginko:h-8">
              <Switch
                :model-value="locale.isDefault"
                @update:model-value="
                  (checked: boolean) => {
                    if (checked) settings.setDefaultLocale(locale.code)
                  }
                "
              />
              <Badge
                v-if="locale.isDefault || locale.code === settings.defaultLocale"
                class="ginko:text-xs"
              >
                {{ settings.t('ginkoCms.common.default') }}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-destructive ginko:ml-1"
                @click="settings.removeLocale(index)"
              >
                <X class="ginko:size-3.5" />
              </Button>
            </div>
          </div>
          <div
            v-else
            class="ginko:grid ginko:grid-cols-[5rem_1fr_1fr_auto] ginko:items-center ginko:gap-3"
          >
            <code
              class="ginko:rounded ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
            >
              {{ locale.code || settings.t('ginkoCms.common.none') }}
            </code>
            <span class="ginko:text-sm">
              {{ locale.label || locale.code || settings.t('ginkoCms.common.untitled') }}
            </span>
            <span class="ginko:text-sm ginko:text-muted-foreground">
              {{ locale.fallback || settings.t('ginkoCms.common.none') }}
            </span>
            <Badge
              v-if="locale.isDefault || locale.code === settings.defaultLocale"
              class="ginko:justify-self-end ginko:text-xs"
            >
              {{ settings.t('ginkoCms.common.default') }}
            </Badge>
          </div>
        </div>
      </div>

      <div v-if="settings.canManageSettings" class="ginko:flex ginko:items-center ginko:gap-2">
        <Button variant="outline" size="sm" @click="settings.addLocale">
          <Plus class="ginko:size-3.5" />
          {{ settings.t('ginkoCms.studio.settingsPage.addLocale') }}
        </Button>
        <Button size="sm" :disabled="settings.localeSaving" @click="settings.handleSaveLocales">
          <Loader2 v-if="settings.localeSaving" class="ginko:size-3.5 ginko:animate-spin" />
          {{ settings.t('ginkoCms.studio.settingsPage.saveLocales') }}
        </Button>
      </div>
    </div>
  </section>
</template>
