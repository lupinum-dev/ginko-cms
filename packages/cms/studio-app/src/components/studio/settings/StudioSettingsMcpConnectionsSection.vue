<script setup lang="ts">
import { AlertCircle, BadgeCheck, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
const showRevokedConnections = ref(false)
type McpConnection = StudioSettingsAdminViewModel['mcpConnections'][number]
type PendingRevokeConnection = Pick<McpConnection, 'apiKeyId' | 'label' | 'ownerUserId' | 'scopes'>
const pendingRevokeConnection = ref<PendingRevokeConnection | null>(null)
const revokedConnectionCount = computed(
  () => settings.mcpConnections.filter((connection) => connection.status !== 'active').length,
)
const visibleConnections = computed(() =>
  settings.mcpConnections.filter(
    (connection) => showRevokedConnections.value || connection.status === 'active',
  ),
)

function requestRevokeConnection(connection: McpConnection) {
  pendingRevokeConnection.value = {
    apiKeyId: connection.apiKeyId,
    label: connection.label,
    ownerUserId: connection.ownerUserId,
    scopes: connection.scopes,
  }
}

async function confirmRevokeConnection() {
  if (!pendingRevokeConnection.value) return
  await settings.handleRevokeMcpConnection(pendingRevokeConnection.value.apiKeyId)
  pendingRevokeConnection.value = null
}
</script>

<template>
  <!-- ─── AI agent connections ─── -->
  <section
    v-if="settings.canManageSettings"
    class="ginko:flex ginko:flex-col ginko:md:flex-row ginko:md:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:md:w-64 ginko:md:shrink-0">
      <h2
        class="ginko:text-sm ginko:font-medium ginko:text-foreground ginko:flex ginko:items-center ginko:gap-2"
      >
        <KeyRound class="ginko:size-4 ginko:text-muted-foreground" />
        AI agent connections
        <Badge variant="outline" class="ginko:text-xs">
          {{
            settings.mcpConnections.filter((connection) => connection.status === 'active').length
          }}
        </Badge>
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        API access for trusted AI agents. Endpoint details stay behind
        {{ settings.t('ginkoCms.studio.common.developerDetails') }}.
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <div
        v-if="settings.mcpConnectionError"
        class="ginko:p-3 ginko:rounded-lg ginko:bg-destructive/10 ginko:text-destructive-fg ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
      >
        <AlertCircle class="ginko:size-4 ginko:shrink-0" />
        {{ settings.mcpConnectionError }}
      </div>

      <div
        v-if="settings.mcpConnectionInfo"
        class="ginko:p-3 ginko:rounded-lg ginko:bg-success/15 ginko:text-success-fg ginko:dark:bg-success/20 ginko:text-sm ginko:flex ginko:items-center ginko:gap-2"
      >
        <BadgeCheck class="ginko:size-4 ginko:shrink-0" />
        {{ settings.mcpConnectionInfo }}
      </div>

      <div
        v-if="settings.mcpCreatedToken"
        class="ginko:rounded-lg ginko:border ginko:border-warning/30 ginko:bg-warning/10 ginko:p-4 ginko:space-y-3"
      >
        <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
          <div class="ginko:min-w-0">
            <div class="ginko:text-sm ginko:font-medium">
              {{ settings.t('ginkoCms.studio.settingsPage.mcpTokenReady') }}
            </div>
            <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{ settings.t('ginkoCms.studio.settingsPage.mcpTokenReadyDescription') }}
            </p>
          </div>
          <Button variant="outline" size="sm" @click="settings.copyMcpToken">
            <Copy class="ginko:size-3.5" />
            Copy
          </Button>
        </div>
        <code
          class="ginko:block ginko:break-all ginko:rounded-md ginko:bg-background ginko:px-3 ginko:py-2 ginko:text-xs"
          >{{ settings.mcpCreatedToken.key }}</code
        >
      </div>

      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-4">
        <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:md:grid-cols-[1fr_10rem]">
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground">Name</Label>
            <Input
              v-model="settings.mcpConnectionForm.name"
              class="ginko:h-8 ginko:text-sm"
              :placeholder="settings.t('ginkoCms.studio.settingsPage.apiKeyNamePlaceholder')"
            />
          </div>
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs ginko:text-muted-foreground">Expiry</Label>
            <Select v-model="settings.mcpConnectionForm.expiresIn">
              <SelectTrigger class="ginko:h-8 ginko:text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in settings.mcpExpiryOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="ginko:mt-4 ginko:space-y-2">
          <Label class="ginko:text-xs ginko:text-muted-foreground">Permissions</Label>
          <div class="ginko:grid ginko:grid-cols-1 ginko:gap-2 ginko:sm:grid-cols-2">
            <label
              v-for="scope in settings.mcpScopeOptions"
              :key="scope.key"
              class="ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-border/40 ginko:px-3 ginko:py-2 ginko:text-xs"
            >
              <input
                type="checkbox"
                class="ginko:size-3.5 ginko:accent-primary"
                :checked="settings.mcpConnectionForm.scopes.includes(scope.key)"
                @change="
                  settings.toggleMcpScope(scope.key, ($event.target as HTMLInputElement).checked)
                "
              />
              <span>{{ scope.label }}</span>
            </label>
          </div>
        </div>

        <div
          class="ginko:mt-4 ginko:flex ginko:flex-col ginko:gap-3 ginko:sm:flex-row ginko:sm:items-center ginko:sm:justify-between"
        >
          <StudioDeveloperDetails class="ginko:min-w-0 ginko:flex-1" :framed="false">
            <code
              class="ginko:mt-2 ginko:block ginko:min-w-0 ginko:break-all ginko:rounded ginko:bg-muted ginko:px-2 ginko:py-1 ginko:text-xs"
              >{{ settings.mcpEndpoint }}</code
            >
          </StudioDeveloperDetails>
          <Button
            size="sm"
            :disabled="settings.mcpConnectionSaving"
            @click="settings.handleCreateMcpConnection"
          >
            <Loader2
              v-if="settings.mcpConnectionSaving"
              class="ginko:size-3.5 ginko:animate-spin"
            />
            <Plus v-else class="ginko:size-3.5" />
            Create
          </Button>
        </div>
      </div>

      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          class="ginko:flex ginko:flex-col ginko:gap-2 ginko:px-4 ginko:py-3 ginko:sm:flex-row ginko:sm:items-center ginko:sm:justify-between"
        >
          <div class="ginko:text-sm ginko:font-medium">Active agent connections</div>
          <Button
            v-if="revokedConnectionCount > 0"
            variant="outline"
            size="sm"
            @click="showRevokedConnections = !showRevokedConnections"
          >
            {{
              showRevokedConnections ? 'Hide revoked' : `Show revoked (${revokedConnectionCount})`
            }}
          </Button>
        </div>
        <div
          v-if="visibleConnections.length === 0"
          class="ginko:px-4 ginko:py-6 ginko:text-sm ginko:text-muted-foreground"
        >
          No active AI agent connections.
        </div>
        <div
          v-for="connection in visibleConnections"
          :key="connection.apiKeyId"
          class="ginko:flex ginko:flex-col ginko:gap-3 ginko:px-4 ginko:py-3 ginko:sm:flex-row ginko:sm:items-center ginko:sm:justify-between"
        >
          <div class="ginko:min-w-0">
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <span class="ginko:text-sm ginko:font-medium">{{
                connection.label || 'Untitled agent connection'
              }}</span>
              <Badge :variant="connection.status === 'active' ? 'default' : 'secondary'">
                {{ connection.status }}
              </Badge>
            </div>
            <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{ connection.scopes.length }} permissions · Updated
              {{ settings.formatTimestamp(connection.updatedAt) }}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="
              connection.status !== 'active' || settings.revokingMcpApiKeyId === connection.apiKeyId
            "
            @click="requestRevokeConnection(connection)"
          >
            <Loader2
              v-if="settings.revokingMcpApiKeyId === connection.apiKeyId"
              class="ginko:size-3.5 ginko:animate-spin"
            />
            <Trash2 v-else class="ginko:size-3.5" />
            Revoke access
          </Button>
          <StudioDeveloperDetails class="ginko:w-full ginko:sm:basis-full" :framed="false">
            <code
              class="ginko:mt-2 ginko:block ginko:break-all ginko:rounded ginko:bg-muted ginko:px-2 ginko:py-1 ginko:text-xs"
              >{{ connection.apiKeyId }}</code
            >
          </StudioDeveloperDetails>
        </div>
      </div>
    </div>

    <StudioConfirmDialog
      :open="!!pendingRevokeConnection"
      title="Revoke agent access?"
      description="This ends the selected agent connection. Existing sessions using this key will no longer be able to access CMS operations."
      confirm-label="Revoke access"
      confirm-variant="destructive"
      @update:open="pendingRevokeConnection = $event ? pendingRevokeConnection : null"
      @confirm="confirmRevokeConnection"
    >
      <div
        v-if="pendingRevokeConnection"
        class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-sm"
      >
        <div class="ginko:font-medium">
          {{ pendingRevokeConnection.label || 'Untitled agent connection' }}
        </div>
        <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
          {{ pendingRevokeConnection.scopes.length }} permissions · owner
          {{ pendingRevokeConnection.ownerUserId }}
        </div>
        <code class="ginko:mt-2 ginko:block ginko:break-all ginko:text-xs">
          {{ pendingRevokeConnection.apiKeyId }}
        </code>
      </div>
    </StudioConfirmDialog>
  </section>
</template>
