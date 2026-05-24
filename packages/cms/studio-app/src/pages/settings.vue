<script setup lang="ts">
import {
  AlertCircle,
  Database,
  BadgeCheck,
  Globe,
  Info,
  KeyRound,
  Languages,
  Loader2,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-vue-next'

import { useStudioSettingsAdmin } from '../composables/internal/useStudioSettingsAdmin'
const {
  addLocale,
  canManageMembers,
  canManageSettings,
  collectionCount,
  createdMcpToken,
  currentLocale,
  defaultLocale,
  error,
  handleAddMember,
  handleCopyMcpToken,
  handleCreateMcpKey,
  handleRevokeMcpKey,
  handleRemoveMember,
  handleRetryRevalidationJob,
  handleSaveLocales,
  handleUpdateRole,
  isLoading,
  config,
  formatMcpTimestamp,
  formatRoleLabel,
  localeError,
  localeSaving,
  locales,
  members,
  mcpCreating,
  mcpEnabled,
  mcpCurlExample,
  mcpEndpoint,
  mcpError,
  mcpHealthRows,
  mcpInfo,
  mcpKeys,
  mcpTokenCopied,
  newMember,
  newMcpKey,
  refreshRevalidationJobs,
  refreshStorageHygiene,
  revalidationError,
  revalidationInfo,
  revalidationJobs,
  revalidationJobsQuery,
  revalidationTargets,
  retryingRevalidationJobId,
  removeLocale,
  setStudioLocale,
  settingsQuery,
  setDefaultLocale,
  showAddMember,
  showCreateMcpKey,
  formatRevalidationReason,
  sortedMembers,
  studioLocales,
  storageHygiene,
  storageHygieneQuery,
  storageHygieneRows,
  storageRiskRows,
  t,
} = useStudioSettingsAdmin()
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader :title="t('ginkoCms.studio.settingsPage.title')" eyebrow="Settings">
        <template #actions>
          <Settings class="ginko:size-4 ginko:text-muted-foreground" />
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-6 ginko:sm:p-8">
        <!-- Global error -->
        <div
          v-if="error"
          class="ginko:mb-6 ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2 ginko:max-w-4xl"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ error }}
        </div>

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="ginko:space-y-8">
          <div
            v-for="i in 3"
            :key="`skeleton-section-${i}`"
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4"
          >
            <div class="ginko:md:w-64 ginko:md:shrink-0 ginko:space-y-2">
              <Skeleton class="ginko:h-4 ginko:w-24" />
              <Skeleton class="ginko:h-3 ginko:w-40" />
            </div>
            <div class="ginko:flex-1 ginko:space-y-3">
              <Skeleton class="ginko:h-10 ginko:w-full ginko:rounded-lg" />
              <Skeleton class="ginko:h-10 ginko:w-full ginko:rounded-lg" />
            </div>
          </div>
        </div>

        <div v-else class="ginko:divide-y">
          <!-- ─── Studio Language ─── -->
          <section
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <Globe class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.studioLanguage') }}
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.studioLanguageDescription') }}
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <Select :model-value="currentLocale" @update:model-value="setStudioLocale($event)">
                <SelectTrigger class="ginko:w-56 ginko:h-9">
                  <SelectValue>
                    <span class="ginko:flex ginko:items-center ginko:gap-2">
                      <Icon
                        :name="
                          studioLocales.find((l) => l.code === currentLocale)?.flag ??
                          'lucide:globe'
                        "
                        class="ginko:size-4 ginko:shrink-0"
                      />
                      {{ studioLocales.find((l) => l.code === currentLocale)?.label }}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="locale in studioLocales"
                    :key="locale.code"
                    :value="locale.code"
                    :text-value="locale.label"
                  >
                    <span class="ginko:flex ginko:items-center ginko:gap-2">
                      <Icon :name="locale.flag" class="ginko:size-4 ginko:shrink-0" />
                      {{ locale.label }}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <!-- ─── Locales ─── -->
          <section
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8 ginko:first:pt-0"
          >
            <!-- Left: label column -->
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <Languages class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.locales') }}
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.localesDescription') }}
              </p>
            </div>

            <!-- Right: content column -->
            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <div
                v-if="localeError"
                class="ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
              >
                <AlertCircle class="ginko:size-4 ginko:shrink-0" />
                {{ localeError }}
              </div>

              <div v-if="settingsQuery.error?.value" class="ginko:text-sm ginko:text-destructive">
                {{ t('ginkoCms.studio.settingsPage.loadError') }}
              </div>

              <!-- Empty state -->
              <StudioEmptyState
                v-if="locales.length === 0"
                :title="t('ginkoCms.studio.settingsPage.noLocales')"
                :description="t('ginkoCms.studio.settingsPage.noLocalesDescription')"
              >
                <template #icon>
                  <Languages class="ginko:size-5" aria-hidden="true" />
                </template>
              </StudioEmptyState>

              <!-- Locale rows -->
              <div
                v-else
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y"
              >
                <div
                  v-for="(locale, index) in locales"
                  :key="`${locale.code || 'new'}-${index}`"
                  class="ginko:p-4"
                >
                  <div
                    class="ginko:grid ginko:grid-cols-[5rem_1fr_1fr_auto] ginko:gap-3 ginko:items-end"
                  >
                    <div class="ginko:space-y-1.5">
                      <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                        t('ginkoCms.common.code')
                      }}</Label>
                      <Input
                        v-model="locale.code"
                        class="ginko:h-8 ginko:text-sm ginko:font-mono"
                        :placeholder="t('ginkoCms.studio.settingsPage.localeCodePlaceholder')"
                      />
                    </div>
                    <div class="ginko:space-y-1.5">
                      <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                        t('ginkoCms.common.label')
                      }}</Label>
                      <Input
                        v-model="locale.label"
                        class="ginko:h-8 ginko:text-sm"
                        :placeholder="t('ginkoCms.studio.settingsPage.localeLabelPlaceholder')"
                      />
                    </div>
                    <div class="ginko:space-y-1.5">
                      <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                        t('ginkoCms.common.fallback')
                      }}</Label>
                      <Select
                        :model-value="locale.fallback || '__none__'"
                        @update:model-value="locale.fallback = $event === '__none__' ? '' : $event"
                      >
                        <SelectTrigger class="ginko:h-8 ginko:text-xs ginko:font-mono">
                          <SelectValue :placeholder="t('ginkoCms.common.none')" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            {{ t('ginkoCms.common.none') }}
                          </SelectItem>
                          <SelectItem
                            v-for="other in locales.filter((l) => l.code && l.code !== locale.code)"
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
                            if (checked) setDefaultLocale(locale.code)
                          }
                        "
                      />
                      <Badge
                        v-if="locale.isDefault || locale.code === defaultLocale"
                        class="ginko:text-[10px]"
                      >
                        {{ t('ginkoCms.common.default') }}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-destructive ginko:ml-1"
                        @click="removeLocale(index)"
                      >
                        <X class="ginko:size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="ginko:flex ginko:items-center ginko:gap-2">
                <Button variant="outline" size="sm" @click="addLocale">
                  <Plus class="ginko:size-3.5" />
                  {{ t('ginkoCms.studio.settingsPage.addLocale') }}
                </Button>
                <Button size="sm" :disabled="localeSaving" @click="handleSaveLocales">
                  <Loader2 v-if="localeSaving" class="ginko:size-3.5 ginko:animate-spin" />
                  {{ t('ginkoCms.studio.settingsPage.saveLocales') }}
                </Button>
              </div>
            </div>
          </section>

          <!-- ─── Members ─── -->
          <section
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <Users class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.members') }}
                <Badge variant="outline" class="ginko:text-xs">
                  {{ members.length }}
                </Badge>
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.membersDescription') }}
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <!-- Add member form -->
              <div
                v-if="canManageMembers && showAddMember"
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-4 ginko:space-y-3"
              >
                <div class="ginko:grid ginko:grid-cols-[1fr_1fr] ginko:gap-3">
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground"
                      >{{ t('ginkoCms.common.userId') }}
                      <span class="ginko:text-destructive">*</span></Label
                    >
                    <Input
                      v-model="newMember.userId"
                      class="ginko:h-8 ginko:text-sm ginko:font-mono"
                      :placeholder="t('ginkoCms.studio.settingsPage.userIdPlaceholder')"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                      t('ginkoCms.common.displayName')
                    }}</Label>
                    <Input
                      v-model="newMember.displayName"
                      class="ginko:h-8 ginko:text-sm"
                      :placeholder="t('ginkoCms.studio.settingsPage.displayNamePlaceholder')"
                    />
                  </div>
                </div>
                <div class="ginko:grid ginko:grid-cols-[1fr_10rem] ginko:gap-3">
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                      t('ginkoCms.common.email')
                    }}</Label>
                    <Input
                      v-model="newMember.email"
                      class="ginko:h-8 ginko:text-sm"
                      :placeholder="t('ginkoCms.studio.settingsPage.emailPlaceholder')"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                      t('ginkoCms.common.role')
                    }}</Label>
                    <Select v-model="newMember.role">
                      <SelectTrigger class="ginko:h-8 ginko:text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">
                          {{ t('ginkoCms.studio.settingsPage.roleOwner') }}
                        </SelectItem>
                        <SelectItem value="publisher">
                          {{ t('ginkoCms.studio.settingsPage.rolePublisher') }}
                        </SelectItem>
                        <SelectItem value="editor">
                          {{ t('ginkoCms.studio.settingsPage.roleEditor') }}
                        </SelectItem>
                        <SelectItem value="viewer">
                          {{ t('ginkoCms.studio.settingsPage.roleViewer') }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div class="ginko:flex ginko:justify-end ginko:gap-2">
                  <Button variant="ghost" size="sm" @click="showAddMember = false">
                    {{ t('ginkoCms.common.cancel') }}
                  </Button>
                  <Button size="sm" @click="handleAddMember">
                    {{ t('ginkoCms.studio.settingsPage.addMemberAction') }}
                  </Button>
                </div>
              </div>

              <!-- Empty state -->
              <StudioEmptyState
                v-if="members.length === 0 && !showAddMember"
                :title="t('ginkoCms.studio.settingsPage.noMembers')"
                :description="t('ginkoCms.studio.settingsPage.noMembersDescription')"
              >
                <template #icon>
                  <Users class="ginko:size-5" aria-hidden="true" />
                </template>
              </StudioEmptyState>

              <!-- Members list -->
              <div
                v-else
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y"
              >
                <div
                  v-for="member in members"
                  :key="member.userId"
                  class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3"
                >
                  <div class="ginko:flex ginko:items-center ginko:gap-3">
                    <div
                      class="ginko:size-8 ginko:rounded-full ginko:bg-muted ginko:flex ginko:items-center ginko:justify-center ginko:shrink-0"
                    >
                      <User class="ginko:size-4 ginko:text-muted-foreground" />
                    </div>
                    <div class="ginko:min-w-0">
                      <span class="ginko:text-sm ginko:block ginko:truncate">{{
                        member.displayName || member.userId
                      }}</span>
                      <span
                        v-if="member.displayName && member.email"
                        class="ginko:text-xs ginko:text-muted-foreground ginko:block ginko:truncate"
                      >
                        {{ member.email }}
                      </span>
                    </div>
                  </div>
                  <div class="ginko:flex ginko:items-center ginko:gap-2">
                    <Select
                      :model-value="member.role"
                      :disabled="!canManageMembers"
                      @update:model-value="handleUpdateRole(member.userId, $event)"
                    >
                      <SelectTrigger class="ginko:h-7 ginko:text-xs ginko:w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">
                          {{ t('ginkoCms.studio.settingsPage.roleOwner') }}
                        </SelectItem>
                        <SelectItem value="publisher">
                          {{ t('ginkoCms.studio.settingsPage.rolePublisher') }}
                        </SelectItem>
                        <SelectItem value="editor">
                          {{ t('ginkoCms.studio.settingsPage.roleEditor') }}
                        </SelectItem>
                        <SelectItem value="viewer">
                          {{ t('ginkoCms.studio.settingsPage.roleViewer') }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-destructive"
                      :disabled="!canManageMembers"
                      @click="handleRemoveMember(member.userId)"
                    >
                      <X class="ginko:size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                v-if="canManageMembers"
                size="sm"
                variant="outline"
                @click="showAddMember = !showAddMember"
              >
                <UserPlus class="ginko:size-3.5" />
                {{ t('ginkoCms.studio.settingsPage.addMember') }}
              </Button>
            </div>
          </section>

          <!-- ─── MCP Keys ─── -->
          <section
            v-if="canManageSettings"
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <KeyRound class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.mcpKeys') }}
                <Badge variant="outline" class="ginko:text-xs">
                  {{ mcpKeys.length }}
                </Badge>
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.mcpKeysDescription') }}
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <div
                v-if="mcpError"
                class="ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
              >
                <AlertCircle class="ginko:size-4 ginko:shrink-0" />
                {{ mcpError }}
              </div>

              <div
                v-if="mcpInfo"
                class="ginko:p-3 ginko:rounded-lg ginko:bg-success/15 ginko:text-success-fg ginko:dark:bg-success/20 ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
              >
                <BadgeCheck class="ginko:size-4 ginko:shrink-0" />
                {{ mcpInfo }}
              </div>

              <div
                v-if="createdMcpToken"
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-4 ginko:space-y-3"
              >
                <div class="ginko:space-y-1">
                  <h3 class="ginko:text-sm ginko:font-medium">
                    {{ t('ginkoCms.studio.settingsPage.mcpTokenReady') }}
                  </h3>
                  <p class="ginko:text-xs ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.settingsPage.mcpTokenReadyDescription') }}
                  </p>
                </div>
                <div
                  class="ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:py-2 ginko:font-mono ginko:text-xs ginko:break-all"
                >
                  {{ createdMcpToken }}
                </div>
                <div class="ginko:flex ginko:items-center ginko:gap-2">
                  <Button size="sm" @click="handleCopyMcpToken">
                    <Icon
                      :name="mcpTokenCopied ? 'lucide:check' : 'lucide:copy'"
                      class="ginko:size-3.5"
                    />
                    {{
                      mcpTokenCopied
                        ? t('ginkoCms.studio.settingsPage.mcpCopied')
                        : t('ginkoCms.studio.settingsPage.mcpCopy')
                    }}
                  </Button>
                </div>
              </div>

              <div
                v-if="mcpEnabled"
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-4 ginko:space-y-3"
              >
                <div class="ginko:space-y-1">
                  <h3 class="ginko:text-sm ginko:font-medium">
                    {{ t('ginkoCms.studio.settingsPage.mcpConnectionTitle') }}
                  </h3>
                  <p class="ginko:text-xs ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.settingsPage.mcpConnectionDescription') }}
                  </p>
                </div>
                <div
                  class="ginko:grid ginko:gap-2 ginko:rounded-md ginko:border ginko:bg-background/60 ginko:p-3"
                >
                  <div
                    v-for="row in mcpHealthRows"
                    :key="row.label"
                    class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-xs"
                  >
                    <BadgeCheck
                      v-if="row.ok === true"
                      class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-success-fg"
                    />
                    <AlertCircle
                      v-else-if="row.ok === false"
                      class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-warning-fg"
                    />
                    <Info
                      v-else
                      class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-muted-foreground"
                    />
                    <div class="ginko:min-w-0">
                      <div class="ginko:font-medium ginko:text-foreground">{{ row.label }}</div>
                      <div class="ginko:break-all ginko:text-muted-foreground">
                        {{ row.detail }}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                    t('ginkoCms.studio.settingsPage.mcpEndpointLabel')
                  }}</Label>
                  <div
                    class="ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:py-2 ginko:font-mono ginko:text-xs ginko:break-all"
                  >
                    {{ mcpEndpoint }}
                  </div>
                </div>
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                    t('ginkoCms.studio.settingsPage.mcpCurlLabel')
                  }}</Label>
                  <pre
                    class="ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:py-2 ginko:font-mono ginko:text-xs ginko:whitespace-pre-wrap ginko:break-all"
                    >{{ mcpCurlExample }}</pre
                  >
                </div>
                <p class="ginko:text-xs ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.settingsPage.mcpConnectionHelp') }}
                </p>
              </div>

              <div
                v-else
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-4 ginko:space-y-2"
              >
                <h3 class="ginko:text-sm ginko:font-medium">
                  {{ t('ginkoCms.studio.settingsPage.mcpDisabledTitle') }}
                </h3>
                <p class="ginko:text-xs ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.settingsPage.mcpDisabledDescription') }}
                </p>
              </div>

              <div
                v-if="showCreateMcpKey"
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-4 ginko:space-y-3"
              >
                <div
                  class="ginko:grid ginko:grid-cols-1 ginko:md:grid-cols-[1fr_16rem] ginko:gap-3"
                >
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground">{{
                      t('ginkoCms.studio.settingsPage.mcpKeyName')
                    }}</Label>
                    <Input
                      v-model="newMcpKey.name"
                      class="ginko:h-8 ginko:text-sm"
                      :placeholder="t('ginkoCms.studio.settingsPage.mcpKeyNamePlaceholder')"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs ginko:text-muted-foreground"
                      >{{ t('ginkoCms.studio.settingsPage.mcpKeyUser') }}
                      <span class="ginko:text-destructive">*</span></Label
                    >
                    <Select
                      :model-value="newMcpKey.boundUserId || '__none__'"
                      @update:model-value="
                        newMcpKey.boundUserId = $event === '__none__' ? '' : $event
                      "
                    >
                      <SelectTrigger class="ginko:h-8 ginko:text-xs">
                        <SelectValue
                          :placeholder="t('ginkoCms.studio.settingsPage.mcpKeyUserPlaceholder')"
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {{ t('ginkoCms.common.none') }}
                        </SelectItem>
                        <SelectItem
                          v-for="member in sortedMembers"
                          :key="member.userId"
                          :value="member.userId"
                          :text-value="member.displayName || member.email || member.userId"
                        >
                          {{ member.displayName || member.email || member.userId }}
                          · {{ formatRoleLabel(member.role) }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p class="ginko:text-xs ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.settingsPage.mcpKeyHelp') }}
                </p>
                <div class="ginko:flex ginko:justify-end ginko:gap-2">
                  <Button variant="ghost" size="sm" @click="showCreateMcpKey = false">
                    {{ t('ginkoCms.common.cancel') }}
                  </Button>
                  <Button size="sm" :disabled="mcpCreating" @click="handleCreateMcpKey">
                    <Loader2 v-if="mcpCreating" class="ginko:size-3.5 ginko:animate-spin" />
                    {{ t('ginkoCms.studio.settingsPage.createMcpKey') }}
                  </Button>
                </div>
              </div>

              <StudioEmptyState
                v-if="mcpKeys.length === 0 && !showCreateMcpKey"
                :title="t('ginkoCms.studio.settingsPage.noMcpKeys')"
                :description="t('ginkoCms.studio.settingsPage.noMcpKeysDescription')"
              >
                <template #icon>
                  <KeyRound class="ginko:size-5" aria-hidden="true" />
                </template>
              </StudioEmptyState>

              <div
                v-else
                class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y"
              >
                <div
                  v-for="key in mcpKeys"
                  :key="key._id"
                  class="ginko:flex ginko:flex-col ginko:gap-3 ginko:px-4 ginko:py-3 ginko:md:flex-row ginko:md:items-center ginko:md:justify-between"
                >
                  <div class="ginko:min-w-0 ginko:space-y-1">
                    <div class="ginko:flex ginko:items-center ginko:gap-2 ginko:min-w-0">
                      <span class="ginko:text-sm ginko:font-medium ginko:truncate">{{
                        key.name
                      }}</span>
                      <Badge
                        :variant="key.status === 'active' ? 'default' : 'secondary'"
                        class="ginko:text-[10px]"
                      >
                        {{
                          key.status === 'active'
                            ? t('ginkoCms.studio.settingsPage.mcpStatusActive')
                            : t('ginkoCms.studio.settingsPage.mcpStatusRevoked')
                        }}
                      </Badge>
                    </div>
                    <div class="ginko:text-xs ginko:text-muted-foreground ginko:break-all">
                      {{ key.prefix }}
                    </div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.settingsPage.mcpActsAs') }}:
                      {{
                        key.boundMember?.displayName || key.boundMember?.email || key.boundUserId
                      }}
                      ·
                      {{ t('ginkoCms.studio.settingsPage.mcpExpires') }}:
                      {{ formatMcpTimestamp(key.expiresAt) }}
                      ·
                      {{ t('ginkoCms.studio.settingsPage.mcpLastUsed') }}:
                      {{ formatMcpTimestamp(key.lastUsedAt) }}
                    </div>
                  </div>
                  <div class="ginko:flex ginko:items-center ginko:gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="ginko:h-7 ginko:px-2 ginko:text-muted-foreground ginko:hover:text-destructive"
                      :disabled="key.status !== 'active'"
                      @click="handleRevokeMcpKey(key._id)"
                    >
                      <Trash2 class="ginko:size-3.5" />
                      {{ t('ginkoCms.studio.settingsPage.revokeMcpKey') }}
                    </Button>
                  </div>
                </div>
              </div>

              <Button size="sm" variant="outline" @click="showCreateMcpKey = !showCreateMcpKey">
                <KeyRound class="ginko:size-3.5" />
                {{ t('ginkoCms.studio.settingsPage.newMcpKey') }}
              </Button>
            </div>
          </section>

          <!-- ─── Revalidation ─── -->
          <section
            v-if="canManageSettings"
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <RadioTower class="ginko:size-4 ginko:text-muted-foreground" />
                Revalidation
                <Badge variant="outline" class="ginko:text-xs">
                  {{ revalidationJobs.length }}
                </Badge>
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                Public cache delivery targets and recent invalidation jobs.
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <div
                v-if="revalidationError"
                class="ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
              >
                <AlertCircle class="ginko:size-4 ginko:shrink-0" />
                {{ revalidationError }}
              </div>

              <div
                v-if="revalidationInfo"
                class="ginko:p-3 ginko:rounded-lg ginko:bg-success/15 ginko:text-success-fg ginko:dark:bg-success/20 ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
              >
                <BadgeCheck class="ginko:size-4 ginko:shrink-0" />
                {{ revalidationInfo }}
              </div>

              <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
                <div
                  v-if="revalidationTargets.length === 0"
                  class="ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
                >
                  No revalidation target is configured. Publish events will stay queued until a
                  target is enabled.
                </div>
                <div
                  v-for="target in revalidationTargets"
                  :key="target.id"
                  class="ginko:px-4 ginko:py-3 ginko:space-y-2"
                >
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                    <div class="ginko:min-w-0">
                      <div class="ginko:flex ginko:items-center ginko:gap-2">
                        <span class="ginko:text-sm ginko:font-medium ginko:truncate">{{
                          target.name
                        }}</span>
                        <Badge
                          :variant="target.enabled ? 'default' : 'secondary'"
                          class="ginko:text-[10px]"
                        >
                          {{ target.enabled ? 'Enabled' : 'Disabled' }}
                        </Badge>
                        <Badge variant="outline" class="ginko:text-[10px]">
                          {{ target.environment }}
                        </Badge>
                      </div>
                      <div
                        class="ginko:text-xs ginko:text-muted-foreground ginko:font-mono ginko:break-all ginko:mt-1"
                      >
                        {{ target.endpoint }}
                      </div>
                    </div>
                    <ShieldCheck class="ginko:size-4 ginko:text-muted-foreground ginko:shrink-0" />
                  </div>
                  <div class="ginko:text-xs ginko:text-muted-foreground">
                    Secret env:
                    <code
                      class="ginko:font-mono ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:rounded"
                      >{{ target.secretEnv }}</code
                    >
                    · Updated {{ formatMcpTimestamp(target.updatedAt) }}
                  </div>
                </div>
              </div>

              <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
                <div
                  class="ginko:px-4 ginko:py-3 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3"
                >
                  <div class="ginko:text-sm ginko:font-medium">Recent jobs</div>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="revalidationJobsQuery.pending.value"
                    @click="refreshRevalidationJobs"
                  >
                    <RefreshCw
                      class="ginko:size-3.5"
                      :class="{ 'animate-spin': revalidationJobsQuery.pending.value }"
                    />
                    Refresh
                  </Button>
                </div>
                <div
                  v-if="revalidationJobs.length === 0"
                  class="ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
                >
                  No revalidation jobs have been recorded yet.
                </div>
                <div
                  v-for="job in revalidationJobs"
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
                          class="ginko:text-[10px]"
                        >
                          {{ job.status }}
                        </Badge>
                        <span class="ginko:font-mono ginko:text-xs ginko:truncate">{{
                          job.id
                        }}</span>
                      </div>
                      <div class="ginko:text-xs ginko:text-muted-foreground">
                        {{ formatRevalidationReason(job) }} · {{ job.attempts }} attempt{{
                          job.attempts === 1 ? '' : 's'
                        }}
                        · Next {{ formatMcpTimestamp(job.nextAttemptAt) }}
                      </div>
                    </div>
                    <Button
                      v-if="job.status === 'failed'"
                      variant="outline"
                      size="sm"
                      :disabled="retryingRevalidationJobId === job.id"
                      @click="handleRetryRevalidationJob(job.id)"
                    >
                      <Loader2
                        v-if="retryingRevalidationJobId === job.id"
                        class="ginko:size-3.5 ginko:animate-spin"
                      />
                      <RotateCcw v-else class="ginko:size-3.5" />
                      Retry
                    </Button>
                  </div>
                  <div
                    v-if="job.lastError"
                    class="ginko:rounded-md ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-xs ginko:px-3 ginko:py-2"
                  >
                    {{ job.lastError }}
                  </div>
                  <div
                    class="ginko:grid ginko:grid-cols-1 ginko:md:grid-cols-2 ginko:gap-3 ginko:text-xs"
                  >
                    <div
                      class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3 ginko:min-w-0"
                    >
                      <div class="ginko:text-muted-foreground ginko:mb-1">Paths</div>
                      <div class="ginko:font-mono ginko:break-all">
                        {{ job.paths.length ? job.paths.join(', ') : 'none' }}
                      </div>
                    </div>
                    <div
                      class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/20 ginko:p-3 ginko:min-w-0"
                    >
                      <div class="ginko:text-muted-foreground ginko:mb-1">Tags</div>
                      <div class="ginko:font-mono ginko:break-all">
                        {{ job.tags.length ? job.tags.join(', ') : 'none' }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ─── Storage hygiene ─── -->
          <section
            v-if="canManageSettings"
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <Database class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.storageHygiene') }}
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.storageHygieneDescription') }}
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <div class="ginko:rounded-lg ginko:border ginko:border-border/40">
                <div
                  class="ginko:flex ginko:flex-col ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3 ginko:sm:flex-row ginko:sm:items-center ginko:sm:justify-between"
                >
                  <div class="ginko:min-w-0">
                    <div class="ginko:text-sm ginko:font-medium">
                      {{ t('ginkoCms.studio.settingsPage.storageFootprint') }}
                    </div>
                    <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
                      {{
                        storageHygiene
                          ? t('ginkoCms.studio.settingsPage.storageScanLimit', {
                              count: String(storageHygiene.scanLimit),
                            })
                          : t('ginkoCms.studio.settingsPage.storageLoading')
                      }}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="storageHygieneQuery.pending.value"
                    @click="refreshStorageHygiene"
                  >
                    <RefreshCw
                      class="ginko:size-3.5"
                      :class="{ 'animate-spin': storageHygieneQuery.pending.value }"
                    />
                    {{ t('ginkoCms.studio.settingsPage.storageRefresh') }}
                  </Button>
                </div>

                <div
                  v-if="storageHygieneQuery.error.value"
                  class="ginko:flex ginko:items-center ginko:gap-2 ginko:px-4 ginko:py-4 ginko:text-sm ginko:text-destructive"
                >
                  <AlertCircle class="ginko:size-4 ginko:shrink-0" />
                  {{ t('ginkoCms.studio.settingsPage.storageLoadError') }}
                </div>

                <div
                  v-else-if="!storageHygiene"
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
                    v-if="storageHygiene.truncatedTables.length"
                    class="ginko:rounded-md ginko:bg-warning/15 ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-warning-fg"
                  >
                    {{
                      t('ginkoCms.studio.settingsPage.storageTruncated', {
                        tables: storageHygiene.truncatedTables.join(', '),
                      })
                    }}
                  </div>

                  <div class="ginko:grid ginko:grid-cols-1 ginko:gap-x-4 ginko:sm:grid-cols-2">
                    <div
                      v-for="row in storageHygieneRows"
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
                      {{ t('ginkoCms.studio.settingsPage.storageGrowthRisks') }}
                    </div>
                    <div class="ginko:space-y-2">
                      <div
                        v-for="risk in storageRiskRows"
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

          <!-- ─── Configuration (read-only) ─── -->
          <section
            class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
          >
            <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
              <h2
                class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
              >
                <Info class="ginko:size-4 ginko:text-muted-foreground" />
                {{ t('ginkoCms.studio.settingsPage.configuration') }}
              </h2>
              <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
                {{ t('ginkoCms.studio.settingsPage.configurationDescription') }}
              </p>
            </div>

            <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
              <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
                <div
                  class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm"
                >
                  <span class="ginko:text-muted-foreground">{{
                    t('ginkoCms.studio.settingsPage.studioRoute')
                  }}</span>
                  <code
                    class="ginko:font-mono ginko:text-xs ginko:bg-muted ginko:px-2 ginko:py-0.5 ginko:rounded"
                    >{{ config.route }}</code
                  >
                </div>
                <div
                  class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm"
                >
                  <span class="ginko:text-muted-foreground">{{
                    t('ginkoCms.studio.settingsPage.defaultLocale')
                  }}</span>
                  <code
                    class="ginko:font-mono ginko:text-xs ginko:bg-muted ginko:px-2 ginko:py-0.5 ginko:rounded"
                    >{{ defaultLocale }}</code
                  >
                </div>
                <div
                  class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm"
                >
                  <span class="ginko:text-muted-foreground">{{
                    t('ginkoCms.common.collections')
                  }}</span>
                  <span class="ginko:text-xs ginko:font-medium">{{
                    t('ginkoCms.studio.settingsPage.collectionsConfigured', {
                      count: collectionCount,
                    })
                  }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
