<script setup lang="ts">
import { User, UserPlus, Users, X } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <!-- ─── Members ─── -->
  <section
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground"
      >
        <Users class="ginko:size-4 ginko:text-muted-foreground" />
        {{ settings.t('ginkoCms.studio.settingsPage.members') }}
        <Badge variant="outline" class="ginko:text-xs">
          {{ settings.members.length }}
        </Badge>
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.membersDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <!-- Add member form -->
      <div
        v-if="settings.canManageMembers && settings.showAddMember"
        class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-4 ginko:space-y-3"
      >
        <div class="ginko:grid ginko:grid-cols-[1fr_1fr] ginko:gap-3">
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground"
              >{{ settings.t('ginkoCms.common.userId') }}
              <span class="ginko:text-destructive">*</span></Label
            >
            <Input
              v-model="settings.newMember.userId"
              class="ginko:h-8 ginko:text-sm ginko:font-mono"
              :placeholder="settings.t('ginkoCms.studio.settingsPage.userIdPlaceholder')"
            />
          </div>
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground">{{
              settings.t('ginkoCms.common.displayName')
            }}</Label>
            <Input
              v-model="settings.newMember.displayName"
              class="ginko:h-8 ginko:text-sm"
              :placeholder="settings.t('ginkoCms.studio.settingsPage.displayNamePlaceholder')"
            />
          </div>
        </div>
        <div class="ginko:grid ginko:grid-cols-[1fr_10rem] ginko:gap-3">
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground">{{
              settings.t('ginkoCms.common.email')
            }}</Label>
            <Input
              v-model="settings.newMember.email"
              class="ginko:h-8 ginko:text-sm"
              :placeholder="settings.t('ginkoCms.studio.settingsPage.emailPlaceholder')"
            />
          </div>
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground">{{
              settings.t('ginkoCms.common.role')
            }}</Label>
            <Select v-model="settings.newMember.role">
              <SelectTrigger class="ginko:h-8 ginko:text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleOwner') }}
                </SelectItem>
                <SelectItem value="publisher">
                  {{ settings.t('ginkoCms.studio.settingsPage.rolePublisher') }}
                </SelectItem>
                <SelectItem value="editor">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleEditor') }}
                </SelectItem>
                <SelectItem value="viewer">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleViewer') }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="ginko:flex ginko:justify-end ginko:gap-2">
          <Button variant="ghost" size="sm" @click="settings.showAddMember = false">
            {{ settings.t('ginkoCms.common.cancel') }}
          </Button>
          <Button size="sm" @click="settings.handleAddMember">
            {{ settings.t('ginkoCms.studio.settingsPage.addMemberAction') }}
          </Button>
        </div>
      </div>

      <!-- Empty state -->
      <StudioEmptyState
        v-if="settings.members.length === 0 && !settings.showAddMember"
        :title="settings.t('ginkoCms.studio.settingsPage.noMembers')"
        :description="settings.t('ginkoCms.studio.settingsPage.noMembersDescription')"
      >
        <template #icon>
          <Users class="ginko:size-5" aria-hidden="true" />
        </template>
      </StudioEmptyState>

      <!-- Members list -->
      <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          v-for="member in settings.members"
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
              :disabled="!settings.canManageMembers"
              @update:model-value="settings.handleUpdateRole(member.userId, $event)"
            >
              <SelectTrigger class="ginko:h-7 ginko:text-xs ginko:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleOwner') }}
                </SelectItem>
                <SelectItem value="publisher">
                  {{ settings.t('ginkoCms.studio.settingsPage.rolePublisher') }}
                </SelectItem>
                <SelectItem value="editor">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleEditor') }}
                </SelectItem>
                <SelectItem value="viewer">
                  {{ settings.t('ginkoCms.studio.settingsPage.roleViewer') }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-destructive"
              :disabled="!settings.canManageMembers"
              @click="settings.handleRemoveMember(member.userId)"
            >
              <X class="ginko:size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Button
        v-if="settings.canManageMembers"
        size="sm"
        variant="outline"
        @click="settings.showAddMember = !settings.showAddMember"
      >
        <UserPlus class="ginko:size-3.5" />
        {{ settings.t('ginkoCms.studio.settingsPage.addMember') }}
      </Button>
    </div>
  </section>
</template>
