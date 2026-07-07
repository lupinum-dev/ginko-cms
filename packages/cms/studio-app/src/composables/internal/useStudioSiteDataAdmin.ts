import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, reactive, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
import { cmsPermissionKeys } from '../permissions'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useCmsStudioSettings } from '../useCmsStudioSettings'
import { useConvexMutation } from '../useStudioConvex'

export function useStudioSiteDataAdmin() {
  const { can } = useCmsStudioAccess()
  const canManageSettings = can(cmsPermissionKeys.manageSettings)

  const studioHost = useStudioHostContext()
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
  const expandedBlock = ref<string | null>(null)
  const blockData = reactive<Record<string, Record<string, unknown>>>({})
  const saving = ref<string | null>(null)
  const error = ref('')
  const deleteTarget = ref<{
    key: string
    label: string
    localized: boolean
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
    expandedBlock.value ? { key: expandedBlock.value } : null,
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

  watch(
    [expandedBlockData, activeLocale],
    ([value, locale]) => {
      if (!value || !expandedBlock.value) return
      const data = value.data
      if (value.localized && typeof data === 'object' && data !== null) {
        blockData[expandedBlock.value] = asRecord(
          structuredClone((data as Record<string, unknown>)[locale] ?? {}),
        )
        return
      }
      blockData[expandedBlock.value] = asRecord(structuredClone(data ?? {}))
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
    try {
      const raw = blockData[key]
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
      await saveDataMutation({
        key,
        data: parsed,
        ...(locales.value.length > 1 ? { locale: activeLocale.value } : {}),
      })
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
    try {
      await updateBlockMutation({ key, visibility })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.saveError'))
    }
  }

  async function handleDeleteBlock(key: string) {
    if (!canManageSettings.value) return
    error.value = ''
    try {
      const preview = (await studioHost
        .requireConvexClient()
        .mutation(api.ginkoCms.siteData.previewDeleteSiteDataBlockOperation, { key })) as {
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
      await deleteBlockMutation({ key, _confirmationToken: token })
      if (expandedBlock.value === key) expandedBlock.value = null
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.siteDataPage.deleteError'))
    }
  }

  const isLoading = computed(
    () => siteDataQuery.data?.value === null && siteDataQuery.pending.value,
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
    isLoading,
    locales,
    newBlock,
    saving,
    showNewForm,
    t,
    toggleBlock,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
