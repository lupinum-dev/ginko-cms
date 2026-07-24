import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorData, getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionArgs } from 'convex/server'
import type { ShallowUnwrapRef } from 'vue'
import { computed, reactive, ref } from 'vue'

import { api } from '../../boundary/api'
import { operationValue } from '../../lib/destructiveWorkflow'
import { cmsPermissionKeys } from '../permissions'
import { useCmsAuthState } from '../useCmsAuthState'
import { useCmsConfig } from '../useCmsConfig'
import { useCmsContractCompatibility } from '../useCmsContractCompatibility'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexAction, useConvexMutation } from '../useStudioConvex'
import { studioConfirm } from './useStudioConfirm'

type SettingsMember = {
  userId: string
  displayName?: string | null
  email?: string | null
  role: CmsRole
}

type SettingsMemberInvitation = {
  invitationId: string
  email: string
  role: CmsRole
  status: 'pending' | 'expired' | 'delivery_failed'
  deliveryState: 'prepared' | 'delivered' | 'failed'
  generation: number
  expiresAt: number
  createdAt: number
  updatedAt: number
  deliveredAt: number | null
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

type McpScope = FunctionArgs<
  typeof api.ginkoCms.mcpOAuthDelegations.createDelegation
>['scopes'][number]

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

type RevalidationDiagnostic = {
  status: 'passed' | 'failed'
  code: string
  statusCode: number | null
  durationMs: number
  message: string
}

type McpOAuthDelegation = {
  _id: string
  delegationId: string
  oauthClientId: string
  ownerUserId: string
  label: string | null
  scopes: string[]
  status: 'active' | 'revoked'
  expiresAt: number | null
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
  revokedAt: number | null
}

type StorageHealth = {
  status: 'healthy' | 'attention'
  checkedAt: number
  usage: {
    trackedAssets: number
    trackedBytes: number
    quotaBytes: null
    quotaSource: 'provider-managed'
  }
  constraints: { supportedAssets: number; countComplete: boolean }
  bytes: { checked: number; missing: number }
  operations: { pendingUploads: number; terminalCleanupFailures: number }
  issues: Array<{ code: string; count: number; message: string }>
}

type StorageDiagnostic = {
  status: 'healthy' | 'missing-setup' | 'quota-or-limit' | 'temporary-failure'
  checkedAt: number
  code: string
  message: string
  createdStorageObject: false
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

const memberInvitationExpiryOptions = [
  { value: '24', label: '1 day' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
] as const

export function useStudioSettingsAdmin() {
  const { can } = useCmsStudioAccess()
  const config = useCmsConfig()
  const mcpEnabled = config.mcp?.enabled === true
  const canManageMembers = can(cmsPermissionKeys.manageMembers)
  const canManageSettings = can(cmsPermissionKeys.manageSettings)
  const contract = useCmsContractCompatibility()
  const authState = useCmsAuthState()
  const settingsQuery = useCmsStudioQuery(api.ginkoCms.settings.getStudioSettings, {})
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
    () => locales.value.find((locale) => locale.isDefault)?.code ?? locales.value[0]?.code ?? 'en',
  )
  const membersQuery = useCmsStudioQuery(
    api.ginkoCms.members.listMembers,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageMembers,
    },
  )
  const members = computed<SettingsMember[]>(() => membersQuery.data?.value ?? [])
  const memberInvitationsQuery = useCmsStudioQuery(
    api.ginkoCms.members.listMemberInvitations,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageMembers,
    },
  )
  const memberInvitations = computed<SettingsMemberInvitation[]>(
    () => memberInvitationsQuery.data?.value ?? [],
  )
  const revalidationTargetsQuery = useCmsStudioQuery(
    api.ginkoCms.revalidation.listRevalidationTargets,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const storageHealthQuery = useCmsStudioQuery(
    api.ginkoCms.maintenance.getStorageHealth,
    {},
    { requiredCapability: cmsPermissionKeys.manageSettings },
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
  const collectionsQuery = useCmsStudioQuery(api.ginkoCms.collections.listCollections, {})
  const mcpDelegationsQuery = useCmsStudioQuery(
    api.ginkoCms.mcpOAuthDelegations.listDelegations,
    computed(() => (mcpEnabled ? {} : null)),
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const collectionCount = computed(() => {
    return (collectionsQuery.data?.value ?? []).length
  })
  const mcpConnections = computed<McpOAuthDelegation[]>(
    () => (mcpDelegationsQuery.data?.value as McpOAuthDelegation[] | null | undefined) ?? [],
  )
  const sendMemberInvitationAction = useConvexAction(api.ginkoCms.members.sendMemberInvitation)
  const resendMemberInvitationAction = useConvexAction(api.ginkoCms.members.resendMemberInvitation)
  const revokeMemberInvitationMutation = useConvexMutation(
    api.ginkoCms.members.revokeMemberInvitation,
  )
  const updateRoleMutation = useConvexMutation(api.ginkoCms.members.updateMemberRole)
  const removeMemberMutation = useConvexMutation(api.ginkoCms.members.removeMember)
  const previewRemoveMemberMutation = useConvexMutation(
    api.ginkoCms.members.previewRemoveMemberOperation,
  )
  const createMcpDelegationMutation = useConvexMutation(
    api.ginkoCms.mcpOAuthDelegations.createDelegation,
  )
  const revokeMcpDelegationMutation = useConvexMutation(
    api.ginkoCms.mcpOAuthDelegations.revokeDelegation,
  )
  const retryRevalidationJobMutation = useConvexMutation(
    api.ginkoCms.revalidation.retryRevalidationJob,
  )
  const previewRetryRevalidationJobMutation = useConvexMutation(
    api.ginkoCms.revalidation.previewRetryRevalidationJobOperation,
  )
  const upsertRevalidationTargetMutation = useConvexMutation(
    api.ginkoCms.revalidation.upsertRevalidationTarget,
  )
  const testRevalidationTargetAction = useConvexAction(
    api.ginkoCms.revalidation.testRevalidationTarget,
  )
  const runStorageDiagnosticMutation = useConvexMutation(
    api.ginkoCms.maintenance.runStorageDiagnostic,
  )
  const error = ref('')
  const revalidationError = ref('')
  const revalidationInfo = ref('')
  const mcpConnectionError = ref('')
  const mcpConnectionErrorDetail = ref('')
  const mcpConnectionInfo = ref('')
  const retryingRevalidationJobId = ref('')
  const testingRevalidationTargetId = ref('')
  const revalidationTargetSaving = ref(false)
  const showRevalidationTargetForm = ref(false)
  const revalidationTargetForm = reactive<{
    targetId: string
    name: string
    environment: RevalidationTarget['environment']
    endpoint: string
    secretEnv: string
    enabled: boolean
  }>({
    targetId: '',
    name: '',
    environment: 'production',
    endpoint: '',
    secretEnv: '',
    enabled: true,
  })
  const revalidationTestResults = reactive<Record<string, RevalidationDiagnostic>>({})
  const storageDiagnostic = ref<StorageDiagnostic | null>(null)
  const storageDiagnosticRunning = ref(false)
  const storageError = ref('')
  const revokingMcpDelegationId = ref('')
  const mcpConnectionSaving = ref(false)
  const showInviteMember = ref(false)
  const invitationPendingId = ref('')
  const mcpConnectionForm = reactive<{
    name: string
    oauthClientId: string
    expiresIn: string
    scopes: McpScope[]
  }>({
    name: 'Codex MCP',
    oauthClientId: '',
    expiresIn: '604800',
    scopes: [
      cmsPermissionKeys.read,
      cmsPermissionKeys.createEntries,
      cmsPermissionKeys.editEntries,
    ],
  })
  const newMemberInvitation = reactive<{
    email: string
    role: CmsRole
    expiresInHours: string
  }>({ email: '', role: 'editor', expiresInHours: '168' })
  const { t, studioLocales, currentLocale, setStudioLocale } = useCmsI18n()

  async function handleSendMemberInvitation() {
    if (!newMemberInvitation.email.trim()) return
    error.value = ''
    invitationPendingId.value = 'new'
    try {
      await sendMemberInvitationAction({
        email: newMemberInvitation.email,
        role: newMemberInvitation.role,
        expiresInHours: Number(newMemberInvitation.expiresInHours),
      })
      newMemberInvitation.email = ''
      newMemberInvitation.role = 'editor'
      newMemberInvitation.expiresInHours = '168'
      showInviteMember.value = false
      await memberInvitationsQuery.refresh()
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.inviteMemberError'))
    } finally {
      invitationPendingId.value = ''
    }
  }

  async function handleResendMemberInvitation(invitationId: string) {
    error.value = ''
    invitationPendingId.value = invitationId
    try {
      await resendMemberInvitationAction({ invitationId, expiresInHours: 168 })
      await memberInvitationsQuery.refresh()
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.resendInviteError'))
    } finally {
      invitationPendingId.value = ''
    }
  }

  async function handleRevokeMemberInvitation(invitationId: string) {
    error.value = ''
    const invitation = memberInvitations.value.find((item) => item.invitationId === invitationId)
    const confirmed = await studioConfirm({
      title: t('ginkoCms.studio.settingsPage.revokeInviteTitle'),
      description: t('ginkoCms.studio.settingsPage.revokeInviteDescription', {
        email: invitation?.email ?? '',
      }),
      confirmLabel: t('ginkoCms.studio.settingsPage.revokeInviteAction'),
      confirmVariant: 'destructive',
    })
    if (!confirmed) return
    invitationPendingId.value = invitationId
    try {
      await revokeMemberInvitationMutation({ invitationId })
      await memberInvitationsQuery.refresh()
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.revokeInviteError'))
    } finally {
      invitationPendingId.value = ''
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
      const preview = (await previewRemoveMemberMutation({ userId })) as {
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
      operationValue<null>(await removeMemberMutation({ userId, _confirmationToken: token }))
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

  function resetRevalidationTargetForm(target?: RevalidationTarget) {
    revalidationTargetForm.targetId = target?.id ?? ''
    revalidationTargetForm.name = target?.name ?? ''
    revalidationTargetForm.environment = target?.environment ?? 'production'
    revalidationTargetForm.endpoint = target?.endpoint ?? ''
    revalidationTargetForm.secretEnv = target?.secretEnv ?? ''
    revalidationTargetForm.enabled = target?.enabled ?? true
    showRevalidationTargetForm.value = true
    revalidationError.value = ''
    revalidationInfo.value = ''
  }

  function closeRevalidationTargetForm() {
    showRevalidationTargetForm.value = false
  }

  async function handleSaveRevalidationTarget() {
    revalidationError.value = ''
    revalidationInfo.value = ''
    revalidationTargetSaving.value = true
    try {
      await upsertRevalidationTargetMutation({
        ...(revalidationTargetForm.targetId ? { targetId: revalidationTargetForm.targetId } : {}),
        name: revalidationTargetForm.name,
        environment: revalidationTargetForm.environment,
        endpoint: revalidationTargetForm.endpoint,
        secretEnv: revalidationTargetForm.secretEnv,
        enabled: revalidationTargetForm.enabled,
      })
      showRevalidationTargetForm.value = false
      revalidationInfo.value = t('ginkoCms.studio.settingsPage.revalidationTargetSaved')
      await revalidationTargetsQuery.refresh()
    } catch (e) {
      revalidationError.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.settingsPage.revalidationTargetSaveError'),
      )
    } finally {
      revalidationTargetSaving.value = false
    }
  }

  async function handleTestRevalidationTarget(targetId: string) {
    revalidationError.value = ''
    revalidationInfo.value = ''
    testingRevalidationTargetId.value = targetId
    try {
      const result = (await testRevalidationTargetAction({ targetId })) as RevalidationDiagnostic
      revalidationTestResults[targetId] = result
      if (result.status === 'passed') {
        revalidationInfo.value = t('ginkoCms.studio.settingsPage.revalidationTestPassed')
      }
    } catch (e) {
      revalidationError.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.settingsPage.revalidationTestError'),
      )
    } finally {
      testingRevalidationTargetId.value = ''
    }
  }

  async function refreshStorageHealth() {
    storageError.value = ''
    await storageHealthQuery.refresh()
  }

  async function handleRunStorageDiagnostic() {
    storageError.value = ''
    storageDiagnosticRunning.value = true
    try {
      storageDiagnostic.value = (await runStorageDiagnosticMutation({})) as StorageDiagnostic
      await storageHealthQuery.refresh()
    } catch (e) {
      storageDiagnostic.value = null
      storageError.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.storageTestError'))
    } finally {
      storageDiagnosticRunning.value = false
    }
  }

  function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
      value / 1024 ** exponent,
    )} ${units[exponent]}`
  }

  // MCP notices are editor-facing: show CMS-coded messages or the human
  // fallback, and keep raw server errors behind the developer-details
  // disclosure instead of the primary notice (PRODUCT.md anti-reference:
  // implementation terminology as primary language).
  function reportMcpConnectionError(e: unknown, fallback: string) {
    const coded = getCmsErrorData(e)
    mcpConnectionError.value = coded?.message ?? fallback
    mcpConnectionErrorDetail.value = coded ? '' : e instanceof Error ? e.message : String(e)
  }

  function toggleMcpScope(scope: McpScope, checked: boolean) {
    const next = new Set(mcpConnectionForm.scopes)
    if (checked) next.add(scope)
    else next.delete(scope)
    mcpConnectionForm.scopes = Array.from(next)
  }

  async function handleCreateMcpConnection() {
    mcpConnectionError.value = ''
    mcpConnectionErrorDetail.value = ''
    mcpConnectionInfo.value = ''
    if (!mcpEnabled) {
      mcpConnectionError.value = 'MCP is disabled for this application.'
      return
    }
    const userId = authState.user.value?.id
    const name = mcpConnectionForm.name.trim()
    const oauthClientId = mcpConnectionForm.oauthClientId.trim()
    const expiresIn = Number(mcpConnectionForm.expiresIn)
    const scopes = Array.from(new Set(mcpConnectionForm.scopes))
    if (!userId) {
      mcpConnectionError.value = 'Sign in before creating an MCP connection.'
      return
    }
    if (!name) {
      mcpConnectionError.value = 'Name the MCP connection before creating it.'
      return
    }
    if (!oauthClientId) {
      mcpConnectionError.value = 'Enter the registered OAuth client ID.'
      return
    }
    if (scopes.length === 0) {
      mcpConnectionError.value = 'Select at least one MCP scope.'
      return
    }
    mcpConnectionSaving.value = true
    try {
      const expiresAt =
        Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null
      await createMcpDelegationMutation({
        ownerUserId: userId,
        oauthClientId,
        label: name,
        scopes,
        expiresAt,
      })
      mcpConnectionInfo.value = t('ginkoCms.studio.settingsPage.mcpCreatedInfo')
      mcpConnectionForm.oauthClientId = ''
      await mcpDelegationsQuery.refresh()
    } catch (e) {
      reportMcpConnectionError(e, t('ginkoCms.studio.settingsPage.mcpCreateError'))
    } finally {
      mcpConnectionSaving.value = false
    }
  }

  async function handleRevokeMcpConnection(delegationId: string) {
    mcpConnectionError.value = ''
    mcpConnectionErrorDetail.value = ''
    mcpConnectionInfo.value = ''
    if (!mcpEnabled) {
      mcpConnectionError.value = 'MCP is disabled for this application.'
      return
    }
    revokingMcpDelegationId.value = delegationId
    try {
      await revokeMcpDelegationMutation({ delegationId })
      mcpConnectionInfo.value = t('ginkoCms.studio.settingsPage.mcpRevokedInfo')
      await mcpDelegationsQuery.refresh()
    } catch (e) {
      reportMcpConnectionError(e, t('ginkoCms.studio.settingsPage.mcpRevokeError'))
    } finally {
      revokingMcpDelegationId.value = ''
    }
  }

  async function handleRetryRevalidationJob(eventId: string) {
    revalidationError.value = ''
    revalidationInfo.value = ''
    retryingRevalidationJobId.value = eventId
    try {
      const preview = (await previewRetryRevalidationJobMutation({ eventId })) as {
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
      operationValue<null>(
        await retryRevalidationJobMutation({
          eventId,
          _confirmationToken: preview.confirmation.token,
        }),
      )
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
    contractCompatibility: contract.compatibility,
    contractQuery: contract.query,
    currentLocale,
    defaultLocale,
    error,
    handleSendMemberInvitation,
    handleResendMemberInvitation,
    handleRevokeMemberInvitation,
    handleRemoveMember,
    handleRetryRevalidationJob,
    handleSaveRevalidationTarget,
    handleTestRevalidationTarget,
    handleRunStorageDiagnostic,
    handleUpdateRole,
    isLoading,
    config,
    locales,
    formatTimestamp,
    formatBytes,
    members,
    membersQuery,
    memberInvitations,
    memberInvitationsQuery,
    memberInvitationExpiryOptions,
    invitationPendingId,
    mcpConnectionError,
    mcpConnectionErrorDetail,
    mcpConnectionForm,
    mcpConnectionInfo,
    mcpConnectionSaving,
    mcpConnections,
    mcpDelegationsQuery,
    mcpEndpoint:
      typeof window === 'undefined' ? '/mcp' : new URL('/mcp', window.location.origin).toString(),
    mcpExpiryOptions,
    mcpScopeOptions,
    newMemberInvitation,
    handleCreateMcpConnection,
    handleRevokeMcpConnection,
    refreshRevalidationJobs,
    resetRevalidationTargetForm,
    closeRevalidationTargetForm,
    refreshStorageHealth,
    revalidationError,
    revalidationInfo,
    revalidationJobs,
    revalidationJobsQuery,
    revalidationTargets,
    revalidationTargetsQuery,
    revalidationTargetForm,
    revalidationTargetSaving,
    revalidationTestResults,
    showRevalidationTargetForm,
    revokingMcpDelegationId,
    retryingRevalidationJobId,
    testingRevalidationTargetId,
    storageDiagnostic,
    storageDiagnosticRunning,
    storageError,
    storageHealth: computed<StorageHealth | null>(
      () => (storageHealthQuery.data?.value as StorageHealth | null | undefined) ?? null,
    ),
    storageHealthQuery,
    formatRevalidationReason,
    persistedSettings,
    setStudioLocale,
    settingsQuery,
    showInviteMember,
    studioLocales,
    toggleMcpScope,
    t,
  }
}

export type StudioSettingsAdminViewModel = ShallowUnwrapRef<
  ReturnType<typeof useStudioSettingsAdmin>
>
