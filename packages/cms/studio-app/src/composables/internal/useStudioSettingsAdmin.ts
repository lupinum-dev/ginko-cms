import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, reactive, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { codeDefinedCollectionList } from '../../lib/codeDefinedCollections'
import { cmsPermissionKeys } from '../permissions'
import { useCmsConfig } from '../useCmsConfig'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexMutation } from '../useStudioConvex'

type SettingsMember = {
  userId: string
  displayName?: string | null
  email?: string | null
  role: CmsRole
}

type McpKeyListItem = {
  _id: string
  name: string
  prefix: string
  boundUserId: string
  issuedBy: string
  status: 'active' | 'revoked'
  createdAt: number
  expiresAt: number
  lastUsedAt?: number | null
  revokedAt?: number | null
  boundMember?: SettingsMember | null
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
    collectionImportRuns: number
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

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function generateMcpToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return `mcp_${body}`
}

export function useStudioSettingsAdmin() {
  const { can } = useCmsStudioAccess()
  const canManageMembers = can(cmsPermissionKeys.manageMembers)
  const canManageSettings = can(cmsPermissionKeys.manageSettings)
  const config = useCmsConfig()
  const studioHost = useStudioHostContext()
  const requestUrl = new URL(window.location.href)
  const settingsQuery = useCmsStudioQuery(
    api.ginkoCms.settings.getSettings,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const persistedSettings = computed(() => settingsQuery.data?.value ?? null)
  const locales = ref<Array<{ code: string; label: string; isDefault: boolean; fallback: string }>>(
    [],
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
  const mcpKeysQuery = useCmsStudioQuery(
    api.ginkoCms.mcpKeys.list,
    {},
    {
      requiredCapability: cmsPermissionKeys.manageSettings,
    },
  )
  const mcpKeys = computed<McpKeyListItem[]>(() => mcpKeysQuery.data?.value ?? [])
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
  const collectionCount = computed(() => {
    const hostCollections = codeDefinedCollectionList(config.collections, defaultLocale.value)
    return hostCollections.length || (collectionsQuery.data?.value ?? []).length
  })
  const storageHygiene = computed<StorageHygieneReport | null>(
    () => (storageHygieneQuery.data?.value as StorageHygieneReport | null | undefined) ?? null,
  )
  const mcpEnabled = computed(() => config.mcp?.enabled === true)
  const addMemberMutation = useConvexMutation(api.ginkoCms.members.addMember)
  const updateRoleMutation = useConvexMutation(api.ginkoCms.members.updateMemberRole)
  const removeMemberMutation = useConvexMutation(api.ginkoCms.members.removeMember)
  const createMcpKeyMutation = useConvexMutation(api.ginkoCms.mcpKeys.create)
  const revokeMcpKeyMutation = useConvexMutation(api.ginkoCms.mcpKeys.revoke)
  const updateSettingsMutation = useConvexMutation(api.ginkoCms.settings.updateSettings)
  const retryRevalidationJobMutation = useConvexMutation(
    api.ginkoCms.revalidation.retryRevalidationJob,
  )
  const error = ref('')
  const localeError = ref('')
  const mcpError = ref('')
  const mcpInfo = ref('')
  const mcpCreating = ref(false)
  const revalidationError = ref('')
  const revalidationInfo = ref('')
  const retryingRevalidationJobId = ref('')
  const mcpTokenCopied = ref(false)
  const showAddMember = ref(false)
  const showCreateMcpKey = ref(false)
  const localeSaving = ref(false)
  const newMember = reactive<{
    userId: string
    role: CmsRole
    displayName: string
    email: string
  }>({ userId: '', role: 'editor', displayName: '', email: '' })
  const newMcpKey = reactive<{ name: string; boundUserId: string }>({
    name: '',
    boundUserId: '',
  })
  const createdMcpToken = ref('')
  const { t, studioLocales, currentLocale, setStudioLocale } = useCmsI18n()
  const mcpBaseUrl = computed(() => requestUrl.origin)
  const mcpEndpoint = computed(() => `${mcpBaseUrl.value.replace(/\/$/, '')}/mcp`)
  const mcpTokenExample = computed(() => createdMcpToken.value || 'mcp_your_token_here')
  const activeMcpKeys = computed(() => mcpKeys.value.filter((key) => key.status === 'active'))
  const mcpHealthRows = computed(() => [
    {
      label: t('ginkoCms.studio.settingsPage.mcpHealthRoute'),
      ok: mcpEnabled.value,
      detail: mcpEnabled.value
        ? t('ginkoCms.studio.settingsPage.mcpHealthRouteEnabled')
        : t('ginkoCms.studio.settingsPage.mcpHealthRouteDisabled'),
    },
    {
      label: t('ginkoCms.studio.settingsPage.mcpHealthEndpoint'),
      ok: mcpEnabled.value,
      detail: mcpEndpoint.value,
    },
    {
      label: t('ginkoCms.studio.settingsPage.mcpHealthToken'),
      ok: activeMcpKeys.value.length > 0,
      detail:
        activeMcpKeys.value.length > 0
          ? t('ginkoCms.studio.settingsPage.mcpHealthTokenReady', {
              count: String(activeMcpKeys.value.length),
            })
          : t('ginkoCms.studio.settingsPage.mcpHealthTokenMissing'),
    },
    {
      label: t('ginkoCms.studio.settingsPage.mcpHealthServerEnv'),
      ok: null,
      detail: 'CONVEX_DEPLOY_KEY',
    },
  ])
  const mcpCurlExample = computed(() =>
    [
      `curl ${mcpEndpoint.value} \\`,
      `  -H 'Authorization: Bearer ${mcpTokenExample.value}' \\`,
      `  -H 'Accept: application/json, text/event-stream' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'`,
    ].join('\n'),
  )

  const sortedMembers = computed(() =>
    [...members.value].sort((a, b) => {
      const left = (a.displayName ?? a.email ?? a.userId).toLowerCase()
      const right = (b.displayName ?? b.email ?? b.userId).toLowerCase()
      return left.localeCompare(right)
    }),
  )
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
        value: numberFormatter.format(report.counts.collectionImportRuns),
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

  watch(
    persistedSettings,
    (settings) => {
      locales.value = (settings?.locales ?? []).map(
        (locale: { code: string; label?: string; isDefault?: boolean; fallback?: string }) => ({
          code: locale.code,
          label: locale.label ?? '',
          isDefault: locale.isDefault ?? false,
          fallback: locale.fallback ?? '',
        }),
      )
    },
    { immediate: true },
  )

  function addLocale() {
    locales.value.push({
      code: '',
      label: '',
      isDefault: locales.value.length === 0,
      fallback: '',
    })
  }

  function removeLocale(index: number) {
    const [removed] = locales.value.splice(index, 1)
    if (removed?.isDefault && locales.value.length > 0) {
      const firstLocale = locales.value[0]
      if (firstLocale) {
        locales.value[0] = {
          code: firstLocale.code,
          label: firstLocale.label,
          fallback: firstLocale.fallback,
          isDefault: true,
        }
      }
    }
  }

  function setDefaultLocale(code: string) {
    for (const locale of locales.value) {
      locale.isDefault = locale.code === code
    }
  }

  async function handleSaveLocales() {
    localeError.value = ''
    const normalized = locales.value
      .map((locale) => ({
        code: locale.code.trim(),
        label: locale.label?.trim() || undefined,
        isDefault: locale.isDefault ?? false,
        fallback: locale.fallback?.trim() || undefined,
      }))
      .filter((locale) => locale.code.length > 0)

    if (normalized.length === 0) {
      localeError.value = t('ginkoCms.studio.settingsPage.localeRequired')
      return
    }
    const defaultCount = normalized.filter((locale) => locale.isDefault).length
    if (defaultCount !== 1) {
      localeError.value = t('ginkoCms.studio.settingsPage.localeDefaultOne')
      return
    }
    const codes = normalized.map((locale) => locale.code)
    if (new Set(codes).size !== codes.length) {
      localeError.value = t('ginkoCms.studio.settingsPage.localeUnique')
      return
    }
    for (const locale of normalized) {
      if (locale.fallback && !codes.includes(locale.fallback)) {
        localeError.value = t('ginkoCms.studio.settingsPage.fallbackMissing', {
          locale: locale.fallback,
        })
        return
      }
      if (locale.fallback === locale.code) {
        localeError.value = t('ginkoCms.studio.settingsPage.fallbackSelf', {
          locale: locale.code,
        })
        return
      }
    }
    localeSaving.value = true
    try {
      await updateSettingsMutation({ locales: normalized })
    } catch (e) {
      localeError.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.saveLocalesError'))
    } finally {
      localeSaving.value = false
    }
  }

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
      await removeMemberMutation({ userId })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.removeMemberError'))
    }
  }

  function formatMemberLabel(member: SettingsMember) {
    return member.displayName?.trim() || member.email?.trim() || member.userId
  }

  function formatRoleLabel(role: CmsRole) {
    if (role === 'owner') return t('ginkoCms.studio.settingsPage.roleOwner')
    if (role === 'publisher') return t('ginkoCms.studio.settingsPage.rolePublisher')
    if (role === 'editor') return t('ginkoCms.studio.settingsPage.roleEditor')
    return t('ginkoCms.studio.settingsPage.roleViewer')
  }

  function resetMcpFeedback() {
    mcpError.value = ''
    mcpInfo.value = ''
    mcpTokenCopied.value = false
  }

  async function handleCreateMcpKey() {
    resetMcpFeedback()
    const boundUserId = newMcpKey.boundUserId.trim()
    if (!boundUserId) {
      mcpError.value = t('ginkoCms.studio.settingsPage.mcpUserRequired')
      return
    }

    const member = members.value.find((item) => item.userId === boundUserId)
    if (!member) {
      mcpError.value = t('ginkoCms.studio.settingsPage.mcpUserInvalid')
      return
    }

    mcpCreating.value = true
    try {
      const token = generateMcpToken()
      const hash = await hashToken(token)
      const prefix = `${token.slice(0, 14)}...`
      const name = newMcpKey.name.trim() || `Studio key for ${formatMemberLabel(member)}`

      await createMcpKeyMutation({
        name,
        boundUserId,
        prefix,
        hash,
      })

      createdMcpToken.value = token
      newMcpKey.name = ''
      newMcpKey.boundUserId = ''
      showCreateMcpKey.value = false
      mcpInfo.value = t('ginkoCms.studio.settingsPage.mcpCreated')
    } catch (e) {
      mcpError.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.mcpCreateError'))
    } finally {
      mcpCreating.value = false
    }
  }

  async function handleCopyMcpToken() {
    if (!createdMcpToken.value) return
    await navigator.clipboard.writeText(createdMcpToken.value)
    mcpTokenCopied.value = true
    setTimeout(() => {
      mcpTokenCopied.value = false
    }, 2e3)
  }

  async function handleRevokeMcpKey(id: string) {
    resetMcpFeedback()
    try {
      await revokeMcpKeyMutation({ id })
      mcpInfo.value = t('ginkoCms.studio.settingsPage.mcpRevoked')
      if (createdMcpToken.value) {
        createdMcpToken.value = ''
      }
    } catch (e) {
      mcpError.value = getCmsErrorMessage(e, t('ginkoCms.studio.settingsPage.mcpRevokeError'))
    }
  }

  function formatMcpTimestamp(value: number | null | undefined) {
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
        throw new Error('Retry confirmation token is missing. Preview again.')
      }
      await retryRevalidationJobMutation({
        eventId,
        _confirmationToken: preview.confirmation.token,
      })
      revalidationInfo.value = 'Revalidation job queued for retry.'
      await revalidationJobsQuery.refresh()
    } catch (e) {
      revalidationError.value = getCmsErrorMessage(e, 'Failed to retry revalidation job.')
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
    localeError,
    localeSaving,
    locales,
    formatMcpTimestamp,
    members,
    membersQuery,
    mcpCreating,
    mcpEnabled,
    mcpHealthRows,
    mcpCurlExample,
    mcpEndpoint,
    mcpError,
    mcpInfo,
    mcpKeys,
    mcpKeysQuery,
    mcpTokenCopied,
    newMember,
    newMcpKey,
    refreshRevalidationJobs,
    revalidationError,
    revalidationInfo,
    revalidationJobs,
    revalidationJobsQuery,
    revalidationTargets,
    revalidationTargetsQuery,
    refreshStorageHygiene,
    retryingRevalidationJobId,
    formatRevalidationReason,
    formatRoleLabel,
    persistedSettings,
    removeLocale,
    setStudioLocale,
    settingsQuery,
    setDefaultLocale,
    showAddMember,
    showCreateMcpKey,
    sortedMembers,
    studioLocales,
    storageHygiene,
    storageHygieneQuery,
    storageHygieneRows,
    storageRiskRows,
    t,
  }
}
