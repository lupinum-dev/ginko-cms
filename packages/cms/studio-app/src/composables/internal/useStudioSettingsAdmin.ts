import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionArgs } from 'convex/server'
import type { ShallowUnwrapRef } from 'vue'
import { computed, reactive, ref } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { codeDefinedCollectionList } from '../../lib/codeDefinedCollections'
import { cmsPermissionKeys } from '../permissions'
import { useCmsAuthState } from '../useCmsAuthState'
import { useCmsConfig } from '../useCmsConfig'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexMutation } from '../useStudioConvex'
import { studioConfirm } from './useStudioConfirm'

type SettingsMember = {
  userId: string
  displayName?: string | null
  email?: string | null
  role: CmsRole
}

type RevalidationTarget = {
  id: string
  name: string
  environment: 'production' | 'preview' | 'development'
  endpoint: string
  secretEnv: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

type McpScope = FunctionArgs<typeof api.ginkoCms.mcpCredentials.upsertSettings>['scopes'][number]

type RevalidationJob = {
  id: string
  status: 'pending' | 'delivering' | 'delivered' | 'failed'
  tags: string[]
  paths: string[]
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  deliveredAt: number | null
  payload: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type StorageHygieneReport = {
  counts: {
    entries: number
    entryDrafts: number
    entryRevisions: number
    publicEntries: number
    contentAssetRefs: number
    outboxEvents: number
    activity: number
    portableRuns: number
    backupArtifacts: number
    softDeletedAssets: number
  }
  revisionsPerEntry: { max: number; average: number }
  assetRefsPerEntry: { max: number; average: number }
  outbox: {
    delivered: number
    failed: number
    pending: number
    delivering: number
  }
  backupArtifacts: number
  scanLimit: number
  truncatedTables: string[]
}

type McpCredentialSettings = {
  _id: string
  apiKeyId: string
  ownerUserId: string
  label: string | null
  scopes: string[]
  status: 'active' | 'revoked'
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
  revokedAt: number | null
}

const mcpScopeOptions = [
  { key: cmsPermissionKeys.read, label: 'Read content' },
  { key: cmsPermissionKeys.createEntries, label: 'Create entries' },
  { key: cmsPermissionKeys.editEntries, label: 'Edit drafts and request publish review' },
] as const

const mcpExpiryOptions = [
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
  { value: '2592000', label: '30 days' },
] as const

export function useStudioSettingsAdmin() {
  const { can } = useCmsStudioAccess()
  const canManageMembers = can(cmsPermissionKeys.manageMembers)
  const canManageSettings = can(cmsPermissionKeys.manageSettings)
  const config = useCmsConfig()
  const studioHost = useStudioHostContext()
  const authState = useCmsAuthState()
  const settingsQuery = useCmsStudioQuery(
    api.ginkoCms.settings.getSettings,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const persistedSettings = computed(() => settingsQuery.data?.value ?? null)
  const locales = computed<
    Array<{ code: string; label: string; isDefault: boolean; fallback: string }>
  >(() =>
    (persistedSettings.value?.locales ?? []).map(
      (locale: { code: string; label?: string; isDefault?: boolean; fallback?: string }) => ({
        code: locale.code,
        label: locale.label ?? '',
        isDefault: locale.isDefault ?? false,
        fallback: locale.fallback ?? '',
      }),
    ),
  )
  const defaultLocale = computed(
    () => locales.value.find((locale) => locale.isDefault)?.code ?? config.defaultLocale ?? 'en',
  )
  const membersQuery = useCmsStudioQuery(
    api.ginkoCms.members.listMembers,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageMembers,
    },
  )
  const members = computed<SettingsMember[]>(() => membersQuery.data?.value ?? [])
  const revalidationTargetsQuery = useCmsStudioQuery(
    api.ginkoCms.revalidation.listRevalidationTargets,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const revalidationJobsQuery = useCmsStudioQuery(
    api.ginkoCms.revalidation.listRevalidationJobs,
    { limit: 20 },
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const revalidationTargets = computed<RevalidationTarget[]>(
    () => revalidationTargetsQuery.data?.value ?? [],
  )
  const revalidationJobs = computed<RevalidationJob[]>(
    () => revalidationJobsQuery.data?.value ?? [],
  )
  const collectionsQuery = useCmsStudioQuery(
    api.ginkoCms.collections.listCollections,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const storageHygieneQuery = useCmsStudioQuery(
    api.ginkoCms.diagnostics.storageHygieneReport,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const mcpCredentialsQuery = useCmsStudioQuery(
    api.ginkoCms.mcpCredentials.listOwnSettings,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const collectionCount = computed(() => {
    const hostCollections = codeDefinedCollectionList(config.collections, defaultLocale.value)
    return hostCollections.length || (collectionsQuery.data?.value ?? []).length
  })
  const storageHygiene = computed<StorageHygieneReport | null>(
    () => (storageHygieneQuery.data?.value as StorageHygieneReport | null | undefined) ?? null,
  )
  const mcpConnections = computed<McpCredentialSettings[]>(
    () => (mcpCredentialsQuery.data?.value as McpCredentialSettings[] | null | undefined) ?? [],
  )
  const addMemberMutation = useConvexMutation(api.ginkoCms.members.addMember)
  const updateRoleMutation = useConvexMutation(api.ginkoCms.members.updateMemberRole)
  const removeMemberMutation = useConvexMutation(api.ginkoCms.members.removeMember)
  const upsertMcpCredentialMutation = useConvexMutation(api.ginkoCms.mcpCredentials.upsertSettings)
  const revokeMcpCredentialMutation = useConvexMutation(api.ginkoCms.mcpCredentials.revokeSettings)
  const retryRevalidationJobMutation = useConvexMutation(
    api.ginkoCms.revalidation.retryRevalidationJob,
  )
  const error = ref('')
  const revalidationError = ref('')
  const revalidationInfo = ref('')
  const mcpConnectionError = ref('')
  const mcpConnectionInfo = ref('')
  const mcpCreatedToken = ref<{ id: string; key: string; name: string } | null>(null)
  const retryingRevalidationJobId = ref('')
  const revokingMcpApiKeyId = ref('')
  const mcpConnectionSaving = ref(false)
  const showAddMember = ref(false)
  const mcpConnectionForm = reactive<{
    name: string
    expiresIn: string
    scopes: McpScope[]
  }>({
    name: 'Codex MCP',
    expiresIn: '604800',
    scopes: [
      cmsPermissionKeys.read,
      cmsPermissionKeys.createEntries,
      cmsPermissionKeys.editEntries,
    ],
  })
  const newMember = reactive<{
    userId: string
    role: CmsRole
    displayName: string
    email: string
  }>({ userId: '', role: 'editor', displayName: '', email: '' })
  const { t, studioLocales, currentLocale, setStudioLocale } = useCmsI18n()

  const numberFormatter = new Intl.NumberFormat()
  const decimalFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
  const storageHygieneRows = computed(() => {
    const report = storageHygiene.value
    if (!report) return []
    return [
      {
        label: t('ginkoCms.studio.settingsPage.storageEntries'),
        value: numberFormatter.format(report.counts.entries),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageDrafts'),
        value: numberFormatter.format(report.counts.entryDrafts),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageRevisions'),
        value: numberFormatter.format(report.counts.entryRevisions),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storagePublicRows'),
        value: numberFormatter.format(report.counts.publicEntries),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageAssetRefs'),
        value: numberFormatter.format(report.counts.contentAssetRefs),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageOutboxEvents'),
        value: numberFormatter.format(report.counts.outboxEvents),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageActivity'),
        value: numberFormatter.format(report.counts.activity),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageImportRuns'),
        value: numberFormatter.format(report.counts.portableRuns),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageBackups'),
        value: numberFormatter.format(report.counts.backupArtifacts),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageSoftDeletedAssets'),
        value: numberFormatter.format(report.counts.softDeletedAssets),
      },
    ]
  })
  const storageRiskRows = computed(() => {
    const report = storageHygiene.value
    if (!report) return []
    return [
      {
        label: t('ginkoCms.studio.settingsPage.storageRevisionRisk'),
        detail: t('ginkoCms.studio.settingsPage.storageRiskMaxAverage', {
          max: numberFormatter.format(report.revisionsPerEntry.max),
          average: decimalFormatter.format(report.revisionsPerEntry.average),
        }),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageAssetRefRisk'),
        detail: t('ginkoCms.studio.settingsPage.storageRiskMaxAverage', {
          max: numberFormatter.format(report.assetRefsPerEntry.max),
          average: decimalFormatter.format(report.assetRefsPerEntry.average),
        }),
      },
      {
        label: t('ginkoCms.studio.settingsPage.storageOutboxRisk'),
        detail: t('ginkoCms.studio.settingsPage.storageOutboxBreakdown', {
          delivered: numberFormatter.format(report.outbox.delivered),
          failed: numberFormatter.format(report.outbox.failed),
          pending: numberFormatter.format(report.outbox.pending),
          delivering: numberFormatter.format(report.outbox.delivering),
        }),
      },
    ]
  })

  async function handleAddMember() {
    if (!newMember.userId.trim()) return
    error.value = ''
    try {
      await addMemberMutation({
        userId: newMember.userId,
        role: newMember.role,
        ...(newMember.displayName ? { displayName: newMember.displayName } : {}),
        ...(newMember.email ? { email: newMember.email } : {}),
      })
      newMember.userId = ''
      newMember.role = 'editor'
      newMember.displayName = ''
      newMember.email = ''
      showAddMember.value = false
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.addMemberError'))
    }
  }

  async function handleUpdateRole(userId: string, role: CmsRole) {
    error.value = ''
    try {
      await updateRoleMutation({ userId, role })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.updateRoleError'))
    }
  }

  async function handleRemoveMember(userId: string) {
    error.value = ''
    try {
      const preview = (await studioHost
        .requireConvexClient()
        .mutation(api.ginkoCms.members.previewRemoveMemberOperation, { userId })) as {
        allowed: boolean
        blockers: Array<{ message: string }>
        warnings: Array<{ message: string }>
        summary: string
        confirmation?: { token: string; expiresAt: number }
      }
      if (preview.allowed === false || preview.blockers.length > 0) {
        error.value =
          preview.blockers[0]?.message ?? preview.warnings[0]?.message ?? preview.summary
        return
      }
      const member = members.value.find((item) => item.userId === userId)
      const confirmed = await studioConfirm({
        title: 'Remove CMS member?',
        description: `Remove ${member?.displayName || member?.email || userId} from this CMS project?`,
        confirmLabel: 'Remove member',
        confirmVariant: 'destructive',
      })
      if (!confirmed) return
      const token =
        preview.confirmation && preview.confirmation.expiresAt > Date.now()
          ? preview.confirmation.token
          : null
      if (!token) throw new Error('Preview this member change again before removing access.')
      await removeMemberMutation({ userId, _confirmationToken: token })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.removeMemberError'))
    }
  }

  function formatTimestamp(value: number | null | undefined) {
    if (typeof value !== 'number') return t('ginkoCms.common.never')
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value)
  }

  async function refreshRevalidationJobs() {
    revalidationError.value = ''
    await Promise.all([revalidationTargetsQuery.refresh(), revalidationJobsQuery.refresh()])
  }

  async function refreshStorageHygiene() {
    await storageHygieneQuery.refresh()
  }

  function toggleMcpScope(scope: McpScope, checked: boolean) {
    const next = new Set(mcpConnectionForm.scopes)
    if (checked) next.add(scope)
    else next.delete(scope)
    mcpConnectionForm.scopes = Array.from(next)
  }

  async function handleCreateMcpConnection() {
    mcpConnectionError.value = ''
    mcpConnectionInfo.value = ''
    mcpCreatedToken.value = null
    const bridgeApi = studioHost.getBridge().mcpApiKeys
    const userId = authState.user.value?.id
    const name = mcpConnectionForm.name.trim()
    const expiresIn = Number(mcpConnectionForm.expiresIn)
    const scopes = Array.from(new Set(mcpConnectionForm.scopes))
    if (!bridgeApi) {
      mcpConnectionError.value = 'Better Auth API-key management is unavailable in this host.'
      return
    }
    if (!userId) {
      mcpConnectionError.value = 'Sign in before creating an MCP connection.'
      return
    }
    if (!name) {
      mcpConnectionError.value = 'Name the MCP connection before creating it.'
      return
    }
    if (scopes.length === 0) {
      mcpConnectionError.value = 'Select at least one MCP scope.'
      return
    }
    mcpConnectionSaving.value = true
    let created: {
      id: string
      key: string
      name?: string | null
      expiresAt?: string | number | Date | null
    } | null = null
    try {
      created = await bridgeApi.create({
        name,
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined,
        metadata: { purpose: 'mcp' },
      })
      await upsertMcpCredentialMutation({
        apiKeyId: created.id,
        ownerUserId: userId,
        label: name,
        scopes,
        expiresAt:
          created.expiresAt === null || created.expiresAt === undefined
            ? null
            : new Date(created.expiresAt).getTime(),
      })
      mcpCreatedToken.value = { id: created.id, key: created.key, name: created.name ?? name }
      mcpConnectionInfo.value = 'MCP connection created.'
      await mcpCredentialsQuery.refresh()
    } catch (e) {
      if (created) {
        try {
          await bridgeApi.delete({ keyId: created.id })
        } catch {
          // The Convex settings write failed. The UI reports the original error,
          // and the Better Auth key cleanup is best-effort because the raw key
          // has not been handed to the user yet.
        }
      }
      mcpConnectionError.value = getCmsErrorMessage(e, 'Failed to create MCP connection.')
    } finally {
      mcpConnectionSaving.value = false
    }
  }

  async function handleRevokeMcpConnection(apiKeyId: string) {
    mcpConnectionError.value = ''
    mcpConnectionInfo.value = ''
    revokingMcpApiKeyId.value = apiKeyId
    try {
      await revokeMcpCredentialMutation({ apiKeyId })
      const bridgeApi = studioHost.getBridge().mcpApiKeys
      if (bridgeApi) {
        await bridgeApi.delete({ keyId: apiKeyId })
      }
      mcpConnectionInfo.value = 'MCP connection revoked.'
      await mcpCredentialsQuery.refresh()
    } catch (e) {
      mcpConnectionError.value = getCmsErrorMessage(e, 'Failed to revoke MCP connection.')
    } finally {
      revokingMcpApiKeyId.value = ''
    }
  }

  async function copyMcpToken() {
    const token = mcpCreatedToken.value?.key
    if (!token) return
    await navigator.clipboard.writeText(token)
    mcpConnectionInfo.value = 'MCP access key copied.'
  }

  async function handleRetryRevalidationJob(eventId: string) {
    revalidationError.value = ''
    revalidationInfo.value = ''
    retryingRevalidationJobId.value = eventId
    try {
      const preview = (await studioHost
        .requireConvexClient()
        .mutation(api.ginkoCms.revalidation.previewRetryRevalidationJobOperation, { eventId })) as {
        allowed: boolean
        blockers: Array<{ message: string }>
        warnings: Array<{ message: string }>
        summary: string
        confirmation?: { token: string; expiresAt: number }
      }
      if (preview.allowed === false || preview.blockers.length > 0) {
        revalidationError.value =
          preview.blockers[0]?.message ?? preview.warnings[0]?.message ?? preview.summary
        return
      }
      if (!preview.confirmation?.token || preview.confirmation.expiresAt <= Date.now()) {
        throw new Error('Preview this website refresh again before retrying.')
      }
      await retryRevalidationJobMutation({
        eventId,
        _confirmationToken: preview.confirmation.token,
      })
      revalidationInfo.value = 'Website refresh job queued for retry.'
      await revalidationJobsQuery.refresh()
    } catch (e) {
      revalidationError.value = getCmsErrorMessage(e, 'Failed to retry website refresh job.')
    } finally {
      retryingRevalidationJobId.value = ''
    }
  }

  function formatRevalidationReason(job: RevalidationJob) {
    return typeof job.payload.reason === 'string' ? job.payload.reason : 'publish'
  }

  const isLoading = computed(
    () => settingsQuery.data?.value === null && settingsQuery.pending.value,
  )

  return {
    canManageMembers,
    canManageSettings,
    collectionCount,
    currentLocale,
    defaultLocale,
    error,
    handleAddMember,
    handleRemoveMember,
    handleRetryRevalidationJob,
    handleUpdateRole,
    isLoading,
    config,
    locales,
    formatTimestamp,
    members,
    membersQuery,
    mcpConnectionError,
    mcpConnectionForm,
    mcpConnectionInfo,
    mcpConnectionSaving,
    mcpConnections,
    mcpCredentialsQuery,
    mcpCreatedToken,
    mcpEndpoint:
      typeof window === 'undefined' ? '/mcp' : new URL('/mcp', window.location.origin).toString(),
    mcpExpiryOptions,
    mcpScopeOptions,
    newMember,
    handleCreateMcpConnection,
    handleRevokeMcpConnection,
    refreshRevalidationJobs,
    revalidationError,
    revalidationInfo,
    revalidationJobs,
    revalidationJobsQuery,
    revalidationTargets,
    revalidationTargetsQuery,
    refreshStorageHygiene,
    revokingMcpApiKeyId,
    retryingRevalidationJobId,
    copyMcpToken,
    formatRevalidationReason,
    persistedSettings,
    setStudioLocale,
    settingsQuery,
    showAddMember,
    studioLocales,
    storageHygiene,
    storageHygieneQuery,
    storageHygieneRows,
    storageRiskRows,
    toggleMcpScope,
    t,
  }
}

export type StudioSettingsAdminViewModel = ShallowUnwrapRef<
  ReturnType<typeof useStudioSettingsAdmin>
>
