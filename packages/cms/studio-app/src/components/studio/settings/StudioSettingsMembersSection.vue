<script setup lang="ts">
import { Mail, RefreshCw, User, UserPlus, Users, X } from '@lucide/vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
</script>

<template>
  <section
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground">
        <Users class="ginko:size-4 ginko:text-muted-foreground" aria-hidden="true" />
        {{ settings.t('ginkoCms.studio.settingsPage.members') }}
        <Badge v-if="settings.canManageMembers" variant="outline" class="ginko:text-xs">
          {{ settings.members.length }}
        </Badge>
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        {{ settings.t('ginkoCms.studio.settingsPage.membersDescription') }}
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-5">
      <StudioNotice
        v-if="!settings.canManageMembers"
        tone="neutral"
        :description="settings.t('ginkoCms.studio.settingsPage.memberOwnerOnly')"
      />

      <template v-else>
        <div
          v-if="settings.showInviteMember"
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-4 ginko:space-y-3"
        >
          <div>
            <h3 class="ginko:text-sm ginko:font-medium">
              {{ settings.t('ginkoCms.studio.settingsPage.inviteMember') }}
            </h3>
            <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{ settings.t('ginkoCms.studio.settingsPage.inviteMemberDescription') }}
            </p>
          </div>
          <div
            class="ginko:grid ginko:grid-cols-1 ginko:@3xl:grid-cols-[1fr_10rem_9rem] ginko:gap-3"
          >
            <div class="ginko:space-y-1.5">
              <Label
                for="member-invitation-email"
                class="ginko:text-xs ginko:text-muted-foreground"
              >
                {{ settings.t('ginkoCms.common.email') }}
                <span class="ginko:text-destructive">*</span>
              </Label>
              <Input
                id="member-invitation-email"
                v-model="settings.newMemberInvitation.email"
                type="email"
                autocomplete="email"
                required
                class="ginko:h-8 ginko:text-sm"
                :placeholder="settings.t('ginkoCms.studio.settingsPage.emailPlaceholder')"
              />
            </div>
            <div class="ginko:space-y-1.5">
              <Label class="ginko:text-xs ginko:text-muted-foreground">
                {{ settings.t('ginkoCms.studio.settingsPage.initialRole') }}
              </Label>
              <Select v-model="settings.newMemberInvitation.role">
                <SelectTrigger class="ginko:h-8 ginko:text-xs" aria-label="Initial role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">{{
                    settings.t('ginkoCms.studio.settingsPage.roleOwner')
                  }}</SelectItem>
                  <SelectItem value="publisher">{{
                    settings.t('ginkoCms.studio.settingsPage.rolePublisher')
                  }}</SelectItem>
                  <SelectItem value="editor">{{
                    settings.t('ginkoCms.studio.settingsPage.roleEditor')
                  }}</SelectItem>
                  <SelectItem value="viewer">{{
                    settings.t('ginkoCms.studio.settingsPage.roleViewer')
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="ginko:space-y-1.5">
              <Label class="ginko:text-xs ginko:text-muted-foreground">
                {{ settings.t('ginkoCms.studio.settingsPage.inviteExpiry') }}
              </Label>
              <Select v-model="settings.newMemberInvitation.expiresInHours">
                <SelectTrigger class="ginko:h-8 ginko:text-xs" aria-label="Invitation expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in settings.memberInvitationExpiryOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p class="ginko:text-xs ginko:text-muted-foreground">
            {{ settings.t('ginkoCms.studio.settingsPage.inviteRoleHelp') }}
          </p>
          <div class="ginko:flex ginko:justify-end ginko:gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="settings.invitationPendingId === 'new'"
              @click="settings.showInviteMember = false"
            >
              {{ settings.t('ginkoCms.common.cancel') }}
            </Button>
            <Button
              size="sm"
              :disabled="
                !settings.newMemberInvitation.email.trim() || settings.invitationPendingId === 'new'
              "
              @click="settings.handleSendMemberInvitation"
            >
              <Mail class="ginko:size-3.5" aria-hidden="true" />
              {{ settings.t('ginkoCms.studio.settingsPage.sendInviteAction') }}
            </Button>
          </div>
        </div>

        <Button v-else size="sm" variant="outline" @click="settings.showInviteMember = true">
          <UserPlus class="ginko:size-3.5" aria-hidden="true" />
          {{ settings.t('ginkoCms.studio.settingsPage.inviteMember') }}
        </Button>

        <div class="ginko:space-y-2">
          <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <h3 class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
              {{ settings.t('ginkoCms.studio.settingsPage.pendingInvitations') }}
            </h3>
            <Badge variant="outline" class="ginko:text-xs">
              {{ settings.memberInvitations.length }}
            </Badge>
          </div>
          <p
            v-if="settings.memberInvitations.length === 0"
            class="ginko:rounded-lg ginko:border ginko:border-dashed ginko:border-border/50 ginko:px-4 ginko:py-3 ginko:text-xs ginko:text-muted-foreground"
          >
            {{ settings.t('ginkoCms.studio.settingsPage.noPendingInvitations') }}
          </p>
          <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
            <div
              v-for="invitation in settings.memberInvitations"
              :key="invitation.invitationId"
              class="ginko:flex ginko:flex-col ginko:gap-3 ginko:px-4 ginko:py-3 ginko:@3xl:flex-row ginko:@3xl:items-center ginko:@3xl:justify-between"
            >
              <div class="ginko:min-w-0">
                <span class="ginko:text-sm ginko:block ginko:truncate">{{ invitation.email }}</span>
                <span class="ginko:text-xs ginko:text-muted-foreground ginko:block">
                  {{
                    settings.t('ginkoCms.studio.settingsPage.inviteExpiresAt', {
                      time: settings.formatTimestamp(invitation.expiresAt),
                    })
                  }}
                </span>
              </div>
              <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                <Badge variant="secondary" class="ginko:text-xs">{{ invitation.role }}</Badge>
                <Badge
                  :variant="invitation.status === 'pending' ? 'outline' : 'destructive'"
                  class="ginko:text-xs"
                >
                  {{
                    invitation.status === 'pending'
                      ? settings.t('ginkoCms.studio.settingsPage.invitePending')
                      : invitation.status === 'expired'
                        ? settings.t('ginkoCms.studio.settingsPage.inviteExpired')
                        : settings.t('ginkoCms.studio.settingsPage.inviteDeliveryFailed')
                  }}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="settings.invitationPendingId === invitation.invitationId"
                  @click="settings.handleResendMemberInvitation(invitation.invitationId)"
                >
                  <RefreshCw class="ginko:size-3.5" aria-hidden="true" />
                  {{ settings.t('ginkoCms.studio.settingsPage.resendInviteAction') }}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="ginko:text-muted-foreground ginko:hover:text-destructive"
                  :disabled="settings.invitationPendingId === invitation.invitationId"
                  @click="settings.handleRevokeMemberInvitation(invitation.invitationId)"
                >
                  {{ settings.t('ginkoCms.studio.settingsPage.revokeInviteAction') }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="ginko:space-y-2">
          <h3 class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
            {{ settings.t('ginkoCms.studio.settingsPage.activeMembers') }}
          </h3>
          <StudioEmptyState
            v-if="settings.members.length === 0"
            :title="settings.t('ginkoCms.studio.settingsPage.noMembers')"
            :description="settings.t('ginkoCms.studio.settingsPage.noMembersDescription')"
          >
            <template #icon>
              <Users class="ginko:size-5" aria-hidden="true" />
            </template>
          </StudioEmptyState>
          <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
            <div
              v-for="member in settings.members"
              :key="member.userId"
              class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3 ginko:px-4 ginko:py-3"
            >
              <div class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-3">
                <div
                  class="ginko:size-8 ginko:rounded-full ginko:bg-muted ginko:flex ginko:items-center ginko:justify-center ginko:shrink-0"
                >
                  <User class="ginko:size-4 ginko:text-muted-foreground" aria-hidden="true" />
                </div>
                <div class="ginko:min-w-0">
                  <span class="ginko:text-sm ginko:block ginko:truncate">{{
                    member.displayName || member.userId
                  }}</span>
                  <span
                    v-if="member.email"
                    class="ginko:text-xs ginko:text-muted-foreground ginko:block ginko:truncate"
                  >
                    {{ member.email }}
                  </span>
                </div>
              </div>
              <div class="ginko:flex ginko:items-center ginko:gap-2">
                <Select
                  :model-value="member.role"
                  @update:model-value="settings.handleUpdateRole(member.userId, $event)"
                >
                  <SelectTrigger
                    class="ginko:h-7 ginko:text-xs ginko:w-24"
                    aria-label="Member role"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">{{
                      settings.t('ginkoCms.studio.settingsPage.roleOwner')
                    }}</SelectItem>
                    <SelectItem value="publisher">{{
                      settings.t('ginkoCms.studio.settingsPage.rolePublisher')
                    }}</SelectItem>
                    <SelectItem value="editor">{{
                      settings.t('ginkoCms.studio.settingsPage.roleEditor')
                    }}</SelectItem>
                    <SelectItem value="viewer">{{
                      settings.t('ginkoCms.studio.settingsPage.roleViewer')
                    }}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-destructive"
                  :aria-label="settings.t('ginkoCms.studio.settingsPage.removeMemberAction')"
                  @click="settings.handleRemoveMember(member.userId)"
                >
                  <X class="ginko:size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
