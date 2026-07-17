<script setup lang="ts">
import { Copy, KeyRound, Loader2, Plus, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'

import type { StudioSettingsAdminViewModel } from '../../../composables/internal/useStudioSettingsAdmin'

const props = defineProps<{ admin: StudioSettingsAdminViewModel }>()
const settings = props.admin
// The /mcp route only exists when the host enables ginkoCms.mcp; without it,
// minting keys would hand owners credentials that can never authenticate.
const mcpRouteEnabled = computed(() => settings.config.mcp?.enabled === true)
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
  <!-- ─── MCP connections ─── -->
  <section
    v-if="settings.canManageSettings"
    class="ginko:flex ginko:flex-col ginko:@3xl:flex-row ginko:@3xl:gap-10 ginko:gap-4 ginko:py-8"
  >
    <div class="ginko:space-y-1 ginko:@3xl:w-64 ginko:@3xl:shrink-0">
      <h2 class="studio-text-label ginko:flex ginko:items-center ginko:gap-2 ginko:text-foreground">
        <KeyRound class="ginko:size-4 ginko:text-muted-foreground" />
        MCP connections for AI tools
        <Badge variant="outline" class="ginko:text-xs">
          {{
            settings.mcpConnections.filter((connection) => connection.status === 'active').length
          }}
        </Badge>
      </h2>
      <p class="ginko:text-xs ginko:text-muted-foreground ginko:leading-relaxed">
        Use MCP connections to let trusted AI tools work with your CMS. Endpoint details stay behind
        {{ settings.t('ginkoCms.studio.common.developerDetails') }}.
      </p>
    </div>

    <div class="ginko:flex-1 ginko:min-w-0 ginko:space-y-4">
      <StudioNotice
        v-if="settings.mcpConnectionError"
        tone="danger"
        :description="settings.mcpConnectionError"
      >
        <StudioDeveloperDetails
          v-if="settings.mcpConnectionErrorDetail"
          class="ginko:mt-2"
          :framed="false"
        >
          <code
            class="ginko:block ginko:break-all ginko:rounded ginko:bg-background ginko:px-2 ginko:py-1 ginko:text-xs"
            >{{ settings.mcpConnectionErrorDetail }}</code
          >
        </StudioDeveloperDetails>
      </StudioNotice>

      <StudioNotice
        v-if="settings.mcpConnectionInfo"
        tone="success"
        :description="settings.mcpConnectionInfo"
      />

      <StudioNotice
        v-if="settings.mcpCreatedToken"
        tone="warning"
        :title="settings.t('ginkoCms.studio.settingsPage.mcpTokenReady')"
        :description="settings.t('ginkoCms.studio.settingsPage.mcpTokenReadyDescription')"
      >
        <div class="ginko:mt-3 ginko:space-y-3">
          <code
            class="ginko:block ginko:break-all ginko:rounded-md ginko:bg-background ginko:px-3 ginko:py-2 ginko:text-xs"
            >{{ settings.mcpCreatedToken.key }}</code
          >
          <Button variant="outline" size="sm" @click="settings.copyMcpToken">
            <Copy class="ginko:size-3.5" />
            Copy access key
          </Button>
        </div>
      </StudioNotice>

      <StudioNotice
        v-if="!mcpRouteEnabled"
        tone="neutral"
        :title="settings.t('ginkoCms.studio.settingsPage.mcpDisabledTitle')"
        :description="settings.t('ginkoCms.studio.settingsPage.mcpDisabledBody')"
      >
        <StudioDeveloperDetails class="ginko:mt-1" :framed="false">
          <p class="ginko:mt-2 ginko:text-xs">
            {{ settings.t('ginkoCms.studio.settingsPage.mcpDisabledDescription') }}
          </p>
        </StudioDeveloperDetails>
      </StudioNotice>

      <div v-else class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-4">
        <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:@3xl:grid-cols-[1fr_10rem]">
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
          <div class="ginko:grid ginko:grid-cols-1 ginko:gap-2 ginko:@2xl:grid-cols-2">
            <label
              v-for="scope in settings.mcpScopeOptions"
              :key="scope.key"
              class="ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-border/40 ginko:px-3 ginko:py-2 ginko:text-xs"
            >
              <Checkbox
                :model-value="settings.mcpConnectionForm.scopes.includes(scope.key)"
                @update:model-value="settings.toggleMcpScope(scope.key, $event === true)"
              />
              <span>{{ scope.label }}</span>
            </label>
          </div>
        </div>

        <div
          class="ginko:mt-4 ginko:flex ginko:flex-col ginko:gap-3 ginko:@2xl:flex-row ginko:@2xl:items-center ginko:@2xl:justify-between"
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
            Create MCP connection
          </Button>
        </div>
      </div>

      <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:divide-y">
        <div
          class="ginko:flex ginko:flex-col ginko:gap-2 ginko:px-4 ginko:py-3 ginko:@2xl:flex-row ginko:@2xl:items-center ginko:@2xl:justify-between"
        >
          <div class="ginko:text-sm ginko:font-medium">Active MCP connections</div>
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
          No active MCP connections.
        </div>
        <div
          v-for="connection in visibleConnections"
          :key="connection.apiKeyId"
          class="ginko:flex ginko:flex-col ginko:gap-3 ginko:px-4 ginko:py-3 ginko:@2xl:flex-row ginko:@2xl:items-center ginko:@2xl:justify-between"
        >
          <div class="ginko:min-w-0">
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <span class="ginko:text-sm ginko:font-medium">{{
                connection.label || 'Untitled MCP connection'
              }}</span>
              <Badge :variant="connection.status === 'active' ? 'default' : 'secondary'">
                {{ connection.status }}
              </Badge>
            </div>
            <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{ connection.scopes.length }} permissions · Updated
              {{ settings.formatTimestamp(connection.updatedAt)
              }}<template v-if="connection.expiresAt">
                · Expires {{ settings.formatTimestamp(connection.expiresAt) }}</template
              >
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
          <StudioDeveloperDetails class="ginko:w-full ginko:@2xl:basis-full" :framed="false">
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
      title="Revoke MCP access?"
      description="This ends the selected MCP connection. Existing AI work sessions using this key will no longer be able to access CMS operations."
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
          {{ pendingRevokeConnection.label || 'Untitled MCP connection' }}
        </div>
        <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
          {{ pendingRevokeConnection.scopes.length }} permissions
        </div>
        <StudioDeveloperDetails class="ginko:mt-2" :framed="false">
          <div class="ginko:mt-2 ginko:grid ginko:gap-2 ginko:text-xs">
            <code class="ginko:block ginko:break-all">
              {{ pendingRevokeConnection.apiKeyId }}
            </code>
            <code class="ginko:block ginko:break-all">
              owner {{ pendingRevokeConnection.ownerUserId }}
            </code>
          </div>
        </StudioDeveloperDetails>
      </div>
    </StudioConfirmDialog>
  </section>
</template>
