import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, reactive, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { operationValue } from '../../lib/destructiveWorkflow'
import { cmsPermissionKeys } from '../permissions'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useCmsStudioSettings } from '../useCmsStudioSettings'
import { useConvexMutation } from '../useStudioConvex'

export function useStudioSiteDataAdmin() {
  const { can } = useCmsStudioAccess()
  const canManageSettings = can(cmsPermissionKeys.manageSettings)

  const studioSettings = useCmsStudioSettings()
  const locales = computed(() => studioSettings.locales.value)
  const defaultLocale = computed(() => studioSettings.defaultLocale.value)
  const activeLocale = ref(defaultLocale.value)
  const siteDataQuery = useCmsStudioQuery(api.ginkoCms.siteData.listSiteData, {})
  const blocks = computed(() => siteDataQuery.data?.value ?? [])
  const createBlockMutation = useConvexMutation(api.ginkoCms.siteData.createSiteDataBlock)
  const updateBlockMutation = useConvexMutation(api.ginkoCms.siteData.updateSiteDataBlock)
  const saveDataMutation = useConvexMutation(api.ginkoCms.siteData.saveSiteData)
  const deleteBlockMutation = useConvexMutation(api.ginkoCms.siteData.deleteSiteDataBlock)
  const previewDeleteBlockMutation = useConvexMutation(
    api.ginkoCms.siteData.previewDeleteSiteDataBlockOperation,
  )
  const expandedBlock = ref<string | null>(null)
  const blockData = reactive<Record<string, Record<string, unknown>>>({})
  const saving = ref<string | null>(null)
  const error = ref('')
  const info = ref('')
  const deleteTarget = ref<{
    key: string
    label: string
    localized: boolean
    visibility: 'private' | 'public'
  } | null>(null)
  const visibilityTarget = ref<{
    key: string
    label: string
    visibility: 'private' | 'public'
  } | null>(null)
  const { t, dateLocale } = useCmsI18n()
  const showNewForm = ref(false)
  const newBlock = reactive({
    key: '',
    label: '',
    localized: false,
    visibility: 'private' as 'private' | 'public',
  })
  const expandedBlockQuery = computed(() =>
    expandedBlock.value ? { key: expandedBlock.value } : ('skip' as const),
  )
  const { data: expandedBlockData } = useCmsStudioQuery(
    api.ginkoCms.siteData.getSiteDataBlock,
    expandedBlockQuery,
  )

  watch(defaultLocale, (nextLocale) => {
    if (!activeLocale.value) {
      activeLocale.value = nextLocale
    }
  })

  const hydratedSnapshot: Record<string, string> = {}

  function isDirty(key: string): boolean {
    return (
      blockData[key] !== undefined &&
      hydratedSnapshot[key] !== undefined &&
      JSON.stringify(blockData[key]) !== hydratedSnapshot[key]
    )
  }

  watch(
    [expandedBlockData, activeLocale],
    ([value, locale], previous) => {
      if (!value || !expandedBlock.value) return
      const key = expandedBlock.value
      // A background refetch (e.g. after a visibility change) must not clobber
      // unsaved edits; an explicit locale switch re-hydrates as before.
      if (locale === previous?.[1] && isDirty(key)) return
      const data = value.data
      const source =
        value.localized && typeof data === 'object' && data !== null
          ? ((data as Record<string, unknown>)[locale] ?? {})
          : (data ?? {})
      // Query results are reactive proxies; site data is JSON by construction,
      // so serialize-parse is the safe deep clone (structuredClone throws).
      const serialized = JSON.stringify(asRecord(source))
      blockData[key] = JSON.parse(serialized) as Record<string, unknown>
      hydratedSnapshot[key] = serialized
    },
    { immediate: true },
  )

  function toggleBlock(key: string) {
    expandedBlock.value = expandedBlock.value === key ? null : key
  }

  async function handleSave(key: string) {
    if (!canManageSettings.value) return
    saving.value = key
    error.value = ''
    info.value = ''
    try {
      const raw = blockData[key]
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
      const localized = blocks.value.find((block) => block.key === key)?.localized ?? false
      await saveDataMutation({
        key,
        data: parsed,
        ...(localized ? { locale: activeLocale.value } : {}),
      })
      hydratedSnapshot[key] = JSON.stringify(blockData[key])
      const visibility = blocks.value.find((block) => block.key === key)?.visibility ?? 'private'
      info.value = t(
        visibility === 'public'
          ? 'ginkoCms.studio.siteDataPage.saveSuccessPublic'
          : 'ginkoCms.studio.siteDataPage.saveSuccessPrivate',
      )
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.saveError'))
    } finally {
      saving.value = null
    }
  }

  async function handleCreateBlock() {
    if (!canManageSettings.value) return
    if (!newBlock.key.trim()) return
    error.value = ''
    info.value = ''
    try {
      await createBlockMutation({
        key: newBlock.key,
        label: newBlock.label || undefined,
        localized: newBlock.localized || undefined,
        visibility: newBlock.visibility,
      })
      newBlock.key = ''
      newBlock.label = ''
      newBlock.localized = false
      newBlock.visibility = 'private'
      showNewForm.value = false
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.createError'))
    }
  }

  async function handleVisibilityChange(key: string, visibility: 'private' | 'public') {
    if (!canManageSettings.value) return
    error.value = ''
    info.value = ''
    try {
      await updateBlockMutation({ key, visibility })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.saveError'))
    }
  }

  async function handleDeleteBlock(key: string) {
    if (!canManageSettings.value) return
    error.value = ''
    info.value = ''
    try {
      const preview = (await previewDeleteBlockMutation({ key })) as {
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
      const token =
        preview.confirmation && preview.confirmation.expiresAt > Date.now()
          ? preview.confirmation.token
          : null
      if (!token) throw new Error('Preview this deletion again before removing the data.')
      operationValue<null>(await deleteBlockMutation({ key, _confirmationToken: token }))
      if (expandedBlock.value === key) expandedBlock.value = null
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.deleteError'))
    }
  }

  const isLoading = computed(
    () => siteDataQuery.data?.value === undefined && siteDataQuery.pending.value,
  )

  return {
    activeLocale,
    blockData,
    blocks,
    canManageSettings,
    dateLocale,
    deleteTarget,
    error,
    expandedBlock,
    expandedBlockData,
    handleCreateBlock,
    handleDeleteBlock,
    handleSave,
    handleVisibilityChange,
    info,
    isLoading,
    locales,
    newBlock,
    saving,
    showNewForm,
    t,
    toggleBlock,
    visibilityTarget,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
