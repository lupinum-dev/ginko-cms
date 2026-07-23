import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { operationValue } from '../../lib/destructiveWorkflow'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../useCmsStudioPaginatedQuery'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexAction, useConvexMutation, useConvexUpload } from '../useStudioConvex'
import { buildAssetFinderItems } from './assetFinderItems'
import type {
  BreadcrumbSegment,
  FinderAssetFacets,
  FinderAssetItem,
  FinderAssetRecord,
  FinderAssetUsage,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from './assetFinderTypes'
import {
  arraysEqual,
  formatDate,
  formatFileSize,
  getImageDimensions,
  mimeIcon,
  mimeTypeMatches,
  normalizeAssetTags,
  parseAspectRatio,
  withoutKey,
} from './assetFinderUtils'
import type { StudioAssetContext } from './types'
import { useStudioAssetReplacement } from './useStudioAssetReplacement'

export type {
  FinderAssetRecord,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from './assetFinderTypes'
export { finderAssetToStudioAsset, mimeKind } from './assetFinderUtils'

export type PreparedAssetTrash = {
  kind: 'trash'
  asset: FinderAssetRecord
  force: boolean
  preview: {
    summary: string
    warnings: Array<{ code: string; message: string }>
    effects: Array<{ kind: string; summary: string; count: number }>
    confirmation: { token: string; expiresAt: number }
  }
}

export function useStudioAssetFinder(
  options: {
    allowedTypes?: string[]
    aspectRatio?: string | null
    assetContext?: StudioAssetContext
    initialTypeFilter?: 'all' | 'image' | 'document'
    mode?: StudioAssetBrowserMode
    onAssetUploaded?: (assetId: string) => void
  } = {},
) {
  useCmsStudioAccess()
  const { t } = useCmsI18n()

  const ASSET_PAGE_SIZE = 100
  const ASSET_USAGE_PAGE_SIZE = 20
  const upload = useConvexUpload(
    api.ginkoCms.assets.createAssetUploadSession,
    api.ginkoCms.assets.claimAssetUploadSession,
    {
      allowedTypes: [...ALLOWED_ASSET_MIME_TYPES],
      maxSizeBytes: MAX_ASSET_SIZE_BYTES,
    },
  )
  const updateAssetMutation = useConvexMutation(api.ginkoCms.assets.updateAsset)
  const trashAssetMutation = useConvexMutation(api.ginkoCms.assets.deleteAsset)
  const restoreAssetMutation = useConvexMutation(api.ginkoCms.assets.restoreAsset)
  const moveAssetMutation = useConvexMutation(api.ginkoCms.assets.moveAsset)
  const previewTrashAssetMutation = useConvexMutation(
    api.ginkoCms.assets.previewDeleteAssetOperation,
  )
  const finalizeAssetUploadSessionAction = useConvexAction(
    api.ginkoCms.assets.finalizeAssetUploadSession,
  )

  async function prepareAssetTrash(asset: FinderAssetRecord): Promise<PreparedAssetTrash | null> {
    actionPending.value = true
    error.value = ''
    try {
      const force = asset.referenceCertainty.state === 'used'
      const preview = await previewTrashAssetMutation({
        assetId: asset.id,
        ...(force ? { force: true } : {}),
      })
      if (preview.allowed === false || preview.blockers.length > 0) {
        throw new Error(
          preview.blockers[0]?.message ?? preview.warnings[0]?.message ?? preview.summary,
        )
      }
      if (!preview.confirmation?.token || preview.confirmation.expiresAt <= Date.now()) {
        throw new Error('Preview this deletion again before removing the file.')
      }
      return {
        kind: 'trash',
        asset,
        force,
        preview: {
          summary: preview.summary,
          warnings: preview.warnings as Array<{ code: string; message: string }>,
          effects: preview.effects as Array<{ kind: string; summary: string; count: number }>,
          confirmation: {
            token: preview.confirmation.token,
            expiresAt: preview.confirmation.expiresAt,
          },
        },
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to preview moving the asset to trash.')
      return null
    } finally {
      actionPending.value = false
    }
  }

  const sidebarMode = ref<SidebarMode>('collections')
  const sidebarKey = ref('global')
  const drillPath = ref<string[]>([])
  const viewMode = ref<'list' | 'grid'>('list')
  const searchQuery = ref('')
  const sortBy = ref<'name' | 'date' | 'size' | 'kind'>('name')
  const selectedAssetId = ref<string | null>(null)
  const typeFilter = ref<'all' | 'image' | 'document'>(options.initialTypeFilter ?? 'all')
  const timeFilter = ref<'any' | '24h' | '7d' | '30d' | '90d'>('any')
  const usageFilter = ref<'all' | 'used' | 'unused-verified' | 'unknown-stale'>('all')
  const sizeFilter = ref<'any' | 'small' | 'medium' | 'large'>('any')
  const uploadInput = ref<HTMLInputElement | null>(null)
  const uploadDestination = ref<'context' | 'collection' | 'global'>('context')
  const uploading = ref(false)
  const actionPending = ref(false)
  const error = ref('')
  const selectedAssetIds = ref<string[]>([])
  const localTagOverrides = ref<Record<string, string[]>>({})
  const discoveryLocation = computed(() => {
    if (
      options.mode === 'pick' &&
      sidebarMode.value === 'collections' &&
      sidebarKey.value === 'global'
    ) {
      return 'accessible' as const
    }
    if (sidebarMode.value === 'tags' || sidebarMode.value === 'trash') return 'all' as const
    if (sidebarMode.value === 'full') {
      if (sidebarKey.value === 'all') return 'all' as const
      if (sidebarKey.value === 'global') return 'global' as const
      return 'collection' as const
    }
    return sidebarKey.value === 'global' ? ('global' as const) : ('collection' as const)
  })
  const assetsQuery = useCmsStudioPaginatedQuery(
    api.ginkoCms.assets.getAssetManagerData,
    () => ({
      search: searchQuery.value.trim() || undefined,
      kind: typeFilter.value,
      deleted: sidebarMode.value === 'trash' ? ('trashed' as const) : ('active' as const),
      usage: usageFilter.value,
      time: timeFilter.value,
      size: sizeFilter.value,
      sort: sortBy.value,
      location: discoveryLocation.value,
      tag: sidebarMode.value === 'tags' ? sidebarKey.value : undefined,
      collection:
        discoveryLocation.value === 'collection'
          ? sidebarKey.value
          : options.assetContext?.collection,
      entryId: options.assetContext?.entryId,
    }),
    { initialNumItems: ASSET_PAGE_SIZE },
  )
  const assetFacetsQuery = useCmsStudioQuery(api.ginkoCms.assets.getAssetManagerFacets)

  const rawAssets = computed<FinderAssetRecord[]>(() => assetsQuery.results.value)
  const assets = computed<FinderAssetRecord[]>(() =>
    rawAssets.value.map((asset) => {
      const override = localTagOverrides.value[asset.id]
      return override ? { ...asset, tags: override } : asset
    }),
  )
  const facets = computed<FinderAssetFacets>(() =>
    assetFacetsQuery.data.value
      ? assetFacetsQuery.data.value
      : {
          activeCount: 0,
          trashedCount: 0,
          globalActiveCount: 0,
          collections: [],
          tags: [],
        },
  )
  const isLoading = computed(() => assetsQuery.status.value === 'loading-first-page')
  const isLoadingMoreAssets = computed(() => assetsQuery.status.value === 'loading-more')
  const hasMoreAssets = computed(() => assetsQuery.hasNextPage.value)
  const loadMoreAssets = () => assetsQuery.loadMore(ASSET_PAGE_SIZE)

  watch(
    rawAssets,
    (nextAssets) => {
      let nextOverrides = { ...localTagOverrides.value }
      let changed = false
      for (const asset of nextAssets) {
        const override = nextOverrides[asset.id]
        if (!override) continue
        if (arraysEqual(override, normalizeAssetTags(asset.tags ?? []))) {
          nextOverrides = withoutKey(nextOverrides, asset.id)
          changed = true
        }
      }
      if (changed) localTagOverrides.value = nextOverrides
    },
    { deep: true },
  )

  const tagPalette = ['#ef4444', '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#eab308', '#14b8a6']

  const tagMap = computed(() => {
    const next = new Map<string, { key: string; label: string; color: string }>()
    for (const facet of facets.value.tags) {
      next.set(facet.key, {
        key: facet.key,
        label: facet.key,
        color: tagPalette[next.size % tagPalette.length] ?? '#888888',
      })
    }
    return next
  })

  const sidebarCollections = computed(() => [
    {
      key: 'global',
      label: t('ginkoCms.studio.assetBrowser.sharedLibrary'),
      icon: 'lucide:globe',
      count: facets.value.globalActiveCount,
    },
    ...facets.value.collections.map((collection) => ({
      key: collection.key,
      label: collection.label,
      icon: 'lucide:folder',
      count: collection.count,
    })),
  ])

  const sidebarTags = computed(() =>
    Array.from(tagMap.value.values())
      .map((tag) => ({
        ...tag,
        count: facets.value.tags.find((facet) => facet.key === tag.key)?.count ?? 0,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  )

  const sidebarFullViews = computed(() => [
    {
      key: 'all',
      label: t('ginkoCms.studio.assetBrowser.allMedia'),
      icon: 'lucide:layers',
      count: facets.value.activeCount,
    },
    {
      key: 'global',
      label: t('ginkoCms.studio.assetBrowser.sharedLibrary'),
      icon: 'lucide:globe',
      count: facets.value.globalActiveCount,
    },
    ...sidebarCollections.value
      .filter((item) => item.key !== 'global')
      .map((item) => ({
        key: item.key,
        label: item.label,
        icon: 'lucide:layout-list',
        count: item.count,
      })),
  ])

  const trashCount = computed(() => facets.value.trashedCount)

  function selectSidebar(mode: SidebarMode, key: string) {
    sidebarMode.value = mode
    sidebarKey.value = key
    drillPath.value = []
    selectedAssetId.value = null
    selectedAssetIds.value = []
    error.value = ''
  }

  function drillInto(folderId: string) {
    drillPath.value = [...drillPath.value, folderId]
    selectedAssetId.value = null
    selectedAssetIds.value = []
  }

  function navigateTo(targetPath: string[]) {
    drillPath.value = [...targetPath]
    selectedAssetId.value = null
    selectedAssetIds.value = []
  }

  function goBack() {
    if (drillPath.value.length === 0) return
    drillPath.value = drillPath.value.slice(0, -1)
    selectedAssetId.value = null
    selectedAssetIds.value = []
  }

  const canGoBack = computed(() => drillPath.value.length > 0)

  const activeFilterCount = computed(() => {
    let count = 0
    if (typeFilter.value !== 'all') count++
    if (timeFilter.value !== 'any') count++
    if (usageFilter.value !== 'all') count++
    if (sizeFilter.value !== 'any') count++
    return count
  })

  function clearFilters() {
    typeFilter.value = 'all'
    timeFilter.value = 'any'
    usageFilter.value = 'all'
    sizeFilter.value = 'any'
  }

  const breadcrumb = computed<BreadcrumbSegment[]>(() => {
    if (sidebarMode.value === 'trash') {
      return [{ label: t('ginkoCms.studio.assetBrowser.trash'), drillPath: [] }]
    }

    if (sidebarMode.value === 'tags') {
      const tag = tagMap.value.get(sidebarKey.value)
      return [
        {
          label: t('ginkoCms.studio.assetBrowser.tagBreadcrumb', {
            tag: tag?.label ?? sidebarKey.value,
          }),
          drillPath: [],
        },
      ]
    }

    if (sidebarMode.value === 'full') {
      if (sidebarKey.value === 'all')
        return [{ label: t('ginkoCms.studio.assetBrowser.allMedia'), drillPath: [] }]
      if (sidebarKey.value === 'global')
        return [{ label: t('ginkoCms.studio.assetBrowser.sharedLibrary'), drillPath: [] }]
      const collection = sidebarCollections.value.find((item) => item.key === sidebarKey.value)
      return [{ label: collection?.label ?? sidebarKey.value, drillPath: [] }]
    }

    if (sidebarKey.value === 'global')
      return [{ label: t('ginkoCms.studio.assetBrowser.sharedLibrary'), drillPath: [] }]

    const collection = sidebarCollections.value.find((item) => item.key === sidebarKey.value)
    return [{ label: collection?.label ?? sidebarKey.value, drillPath: [] }]
  })

  const currentItems = computed<FinderItem[]>(() => buildAssetFinderItems(assets.value))

  const selectedAsset = computed(() =>
    selectedAssetId.value
      ? (assets.value.find((asset) => asset.id === selectedAssetId.value) ?? null)
      : null,
  )
  const assetReplacement = useStudioAssetReplacement({
    selectedAsset,
    actionPending,
    error,
  })
  const selectedAssetUsagesQuery = useCmsStudioPaginatedQuery(
    api.ginkoCms.assets.listAssetUsages,
    () =>
      selectedAsset.value?.referenceCertainty.state === 'used'
        ? { assetId: selectedAsset.value.id }
        : null,
    { initialNumItems: ASSET_USAGE_PAGE_SIZE },
  )
  const selectedAssetUsages = computed<FinderAssetUsage[]>(
    () => selectedAssetUsagesQuery.results.value,
  )
  const selectedAssetUsagesLoading = computed(
    () => selectedAssetUsagesQuery.status.value === 'loading-first-page',
  )
  const selectedAssetUsagesLoadingMore = computed(
    () => selectedAssetUsagesQuery.status.value === 'loading-more',
  )
  const hasMoreSelectedAssetUsages = computed(() => selectedAssetUsagesQuery.hasNextPage.value)
  const loadMoreSelectedAssetUsages = () => selectedAssetUsagesQuery.loadMore(ASSET_USAGE_PAGE_SIZE)

  const selectedAssetTags = computed(() => selectedAsset.value?.tags ?? [])

  function selectAsset(id: string | null) {
    selectedAssetId.value = id
    error.value = ''
  }

  function clearAssetSelection() {
    selectedAssetIds.value = []
  }

  function toggleAssetSelection(assetId: string) {
    selectedAssetIds.value = selectedAssetIds.value.includes(assetId)
      ? selectedAssetIds.value.filter((id) => id !== assetId)
      : [...selectedAssetIds.value, assetId]
  }

  function setAssetSelection(assetIds: string[]) {
    selectedAssetIds.value = [...new Set(assetIds)]
  }

  const folderCount = computed(
    () => currentItems.value.filter((item) => item.type === 'folder').length,
  )
  const assetCount = computed(
    () => currentItems.value.filter((item) => item.type === 'asset').length,
  )
  const visibleAssetIds = computed(() =>
    currentItems.value
      .filter((item): item is FinderAssetItem => item.type === 'asset')
      .map((item) => item.asset.id),
  )
  const allVisibleAssetsSelected = computed(
    () =>
      visibleAssetIds.value.length > 0 &&
      visibleAssetIds.value.every((id) => selectedAssetIds.value.includes(id)),
  )
  const hasAssetSelection = computed(() => selectedAssetIds.value.length > 0)
  const selectedVisibleAssetIds = computed(() =>
    selectedAssetIds.value.filter((id) => visibleAssetIds.value.includes(id)),
  )

  function toggleAllVisibleAssets() {
    if (allVisibleAssetsSelected.value) {
      clearAssetSelection()
      return
    }
    setAssetSelection(visibleAssetIds.value)
  }

  function isSidebarActive(mode: SidebarMode, key: string): boolean {
    return sidebarMode.value === mode && sidebarKey.value === key
  }

  async function handleUpload(event: Event) {
    const target = event.target as HTMLInputElement | null
    const files = target?.files
    if (!files?.length) return
    uploading.value = true
    error.value = ''
    try {
      for (const file of Array.from(files)) {
        if (
          options.allowedTypes?.length &&
          !options.allowedTypes.some((acceptedType) => mimeTypeMatches(acceptedType, file.type))
        ) {
          throw new Error(`File type "${file.type || 'unknown'}" is not allowed.`)
        }
        const dimensions = await getImageDimensions(file)
        const expectedRatio = parseAspectRatio(options.aspectRatio)
        if (expectedRatio && dimensions.width && dimensions.height) {
          const actualRatio = dimensions.width / dimensions.height
          const tolerance = 0.01
          if (Math.abs(actualRatio - expectedRatio) / expectedRatio > tolerance) {
            throw new Error(`Image must use a ${options.aspectRatio} aspect ratio.`)
          }
        }
        const uploaded = await upload.upload(file)
        if (Array.isArray(uploaded)) {
          throw new TypeError('Single-file upload returned multiple sessions.')
        }
        const context = options.assetContext
        const scope: 'global' | 'collection' | 'entry' =
          uploadDestination.value === 'global'
            ? 'global'
            : uploadDestination.value === 'collection'
              ? 'collection'
              : context?.entryId
                ? 'entry'
                : context?.collection
                  ? 'collection'
                  : 'global'
        const assetId = await finalizeAssetUploadSessionAction({
          sessionId: uploaded.sessionId,
          token: uploaded.token,
          filename: file.name,
          scope,
          ...(scope === 'entry' ? { entryId: context?.entryId } : {}),
          ...(scope !== 'global' ? { collection: context?.collection } : {}),
        })
        if (typeof assetId === 'string') await context?.onAssetRegistered?.(assetId, scope)
        if (typeof assetId === 'string') options.onAssetUploaded?.(assetId)
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to upload asset.')
    } finally {
      upload.reset()
      uploading.value = false
      if (uploadInput.value) uploadInput.value.value = ''
    }
  }

  async function updateAssetTags(assetId: string, nextTags: string[]) {
    const normalized = normalizeAssetTags(nextTags)
    const previous = localTagOverrides.value[assetId]
    localTagOverrides.value = {
      ...localTagOverrides.value,
      [assetId]: normalized,
    }
    try {
      await updateAssetMutation({
        assetId,
        tags: normalized,
      })
    } catch (cause) {
      if (previous) {
        localTagOverrides.value = {
          ...localTagOverrides.value,
          [assetId]: previous,
        }
      } else {
        localTagOverrides.value = withoutKey(localTagOverrides.value, assetId)
      }
      throw cause
    }
  }

  async function setSelectedAssetTags(nextTags: string[]) {
    if (!selectedAsset.value) return
    actionPending.value = true
    error.value = ''
    try {
      await updateAssetTags(selectedAsset.value.id, nextTags)
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to update asset tags.')
    } finally {
      actionPending.value = false
    }
  }

  async function addTagToSelectedAsset(tag: string) {
    if (!selectedAsset.value) return
    await setSelectedAssetTags([...selectedAsset.value.tags, tag])
  }

  async function removeTagFromSelectedAsset(tag: string) {
    if (!selectedAsset.value) return
    await setSelectedAssetTags(selectedAsset.value.tags.filter((candidate) => candidate !== tag))
  }

  async function applyTagToSelection(tag: string, mode: 'add' | 'remove') {
    const normalizedTag = normalizeAssetTags([tag])[0]
    if (!normalizedTag || selectedVisibleAssetIds.value.length === 0) return
    actionPending.value = true
    error.value = ''
    try {
      for (const assetId of selectedVisibleAssetIds.value) {
        const asset = assets.value.find((candidate) => candidate.id === assetId)
        if (!asset) continue
        const nextTags =
          mode === 'add'
            ? [...asset.tags, normalizedTag]
            : asset.tags.filter((candidate) => candidate !== normalizedTag)
        await updateAssetTags(assetId, nextTags)
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, `Failed to ${mode} tag for selected assets.`)
    } finally {
      actionPending.value = false
    }
  }

  async function executeAssetTrash(prepared: PreparedAssetTrash) {
    actionPending.value = true
    error.value = ''
    try {
      operationValue<null>(
        await trashAssetMutation({
          assetId: prepared.asset.id,
          force: prepared.force ? true : undefined,
          _confirmationToken: prepared.preview.confirmation.token,
        }),
      )
      selectedAssetIds.value = selectedAssetIds.value.filter((id) => id !== prepared.asset.id)
      if (selectedAsset.value?.id === prepared.asset.id && sidebarMode.value !== 'trash') {
        selectedAssetId.value = null
      }
      return true
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to move the asset to trash.')
      return false
    } finally {
      actionPending.value = false
    }
  }

  async function restoreSelectedAsset() {
    if (!selectedAsset.value) return
    actionPending.value = true
    error.value = ''
    try {
      await restoreAssetMutation({ assetId: selectedAsset.value.id })
      if (sidebarMode.value === 'trash') selectedAssetId.value = null
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to restore asset.')
    } finally {
      actionPending.value = false
    }
  }

  async function moveSelectedAssetToCollection() {
    if (!selectedAsset.value?.collection) return
    actionPending.value = true
    error.value = ''
    try {
      await moveAssetMutation({
        assetId: selectedAsset.value.id,
        scope: 'collection',
        collection: selectedAsset.value.collection,
      })
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to move asset to collection scope.')
    } finally {
      actionPending.value = false
    }
  }

  async function moveSelectedAssetToGlobal() {
    if (!selectedAsset.value) return
    actionPending.value = true
    error.value = ''
    try {
      await moveAssetMutation({
        assetId: selectedAsset.value.id,
        scope: 'global',
      })
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to move asset to global scope.')
    } finally {
      actionPending.value = false
    }
  }

  async function moveAssetsToCollection(assetIds: string[]) {
    const selectedAssets = assetIds
      .map((id) => assets.value.find((asset) => asset.id === id) ?? null)
      .filter((asset): asset is FinderAssetRecord => !!asset)
    if (selectedAssets.length === 0) return
    const incompatible = selectedAssets.filter(
      (asset) => asset.scope !== 'entry' || !asset.collection,
    )
    if (incompatible.length > 0) {
      error.value = 'Only entry-owned assets with a collection can be shared in collection.'
      return
    }
    actionPending.value = true
    error.value = ''
    try {
      for (const asset of selectedAssets) {
        if (!asset.collection) continue
        await moveAssetMutation({
          assetId: asset.id,
          scope: 'collection',
          collection: asset.collection,
        })
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to share selected assets in collection.')
    } finally {
      actionPending.value = false
    }
  }

  async function moveAssetsToGlobal(assetIds: string[]) {
    const selectedAssets = assetIds
      .map((id) => assets.value.find((asset) => asset.id === id) ?? null)
      .filter((asset): asset is FinderAssetRecord => !!asset && asset.scope !== 'global')
    if (selectedAssets.length === 0) return
    actionPending.value = true
    error.value = ''
    try {
      for (const asset of selectedAssets) {
        await moveAssetMutation({
          assetId: asset.id,
          scope: 'global',
        })
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to make selected assets global.')
    } finally {
      actionPending.value = false
    }
  }

  return {
    assets,
    viewMode,
    searchQuery,
    sortBy,
    selectedAssetId,
    typeFilter,
    timeFilter,
    usageFilter,
    sizeFilter,
    activeFilterCount,
    clearFilters,

    sidebarCollections,
    sidebarTags,
    sidebarFullViews,
    trashCount,

    selectSidebar,
    drillInto,
    navigateTo,
    goBack,
    canGoBack,

    breadcrumb,
    currentItems,
    folderCount,
    assetCount,

    selectedAsset,
    selectedAssetUsages,
    selectedAssetUsagesLoading,
    selectedAssetUsagesLoadingMore,
    hasMoreSelectedAssetUsages,
    loadMoreSelectedAssetUsages,
    selectedAssetTags,
    selectAsset,
    selectedAssetIds,
    toggleAssetSelection,
    clearAssetSelection,
    toggleAllVisibleAssets,
    allVisibleAssetsSelected,
    hasAssetSelection,
    selectedVisibleAssetIds,

    isSidebarActive,
    formatFileSize,
    formatDate,
    mimeIcon,
    isLoading,
    isLoadingMoreAssets,
    hasMoreAssets,
    loadMoreAssets,

    uploadInput,
    uploadDestination,
    uploading,
    handleUpload,
    ...assetReplacement,
    error,
    actionPending,
    addTagToSelectedAsset,
    removeTagFromSelectedAsset,
    applyTagToSelection,
    setSelectedAssetTags,
    prepareAssetTrash,
    executeAssetTrash,
    restoreSelectedAsset,
    moveSelectedAssetToCollection,
    moveSelectedAssetToGlobal,
    moveAssetsToCollection,
    moveAssetsToGlobal,
    tagMap,
  }
}
