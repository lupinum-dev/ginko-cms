import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../useCmsStudioPaginatedQuery'
import { useConvexAction, useConvexMutation, useConvexUpload } from '../useStudioConvex'
import type {
  BreadcrumbSegment,
  FinderAssetItem,
  FinderAssetRecord,
  FinderFolder,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from './assetFinderTypes'
import {
  arraysEqual,
  formatDate,
  formatFileSize,
  getImageDimensions,
  latestAssetTimestamp,
  mimeIcon,
  mimeTypeMatches,
  normalizeAssetTags,
  parseAspectRatio,
  withoutKey,
} from './assetFinderUtils'
import type { StudioAssetContext } from './types'

export type {
  FinderAssetRecord,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from './assetFinderTypes'
export { finderAssetToStudioAsset, mimeKind } from './assetFinderUtils'

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
  const upload = useConvexUpload(api.ginkoCms.assets.generateUploadUrl, {
    allowedTypes: [...ALLOWED_ASSET_MIME_TYPES],
    maxSizeBytes: MAX_ASSET_SIZE_BYTES,
  })
  const updateAssetMutation = useConvexMutation(api.ginkoCms.assets.updateAsset)
  const trashAssetMutation = useConvexMutation(api.ginkoCms.assets.deleteAsset)
  const restoreAssetMutation = useConvexMutation(api.ginkoCms.assets.restoreAsset)
  const moveAssetMutation = useConvexMutation(api.ginkoCms.assets.moveAsset)
  const previewTrashAssetMutation = useConvexMutation(
    api.ginkoCms.assets.previewDeleteAssetOperation,
  )
  const registerAssetAction = useConvexAction(api.ginkoCms.assets.registerAsset)

  async function previewTrashAsset(asset: FinderAssetRecord, force: boolean) {
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
    return preview.confirmation.token
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
  const usageFilter = ref<'all' | 'used' | 'unused'>('all')
  const sizeFilter = ref<'any' | 'small' | 'medium' | 'large'>('any')
  const uploadInput = ref<HTMLInputElement | null>(null)
  const uploadDestination = ref<'context' | 'collection' | 'global'>('context')
  const uploading = ref(false)
  const actionPending = ref(false)
  const error = ref('')
  const selectedAssetIds = ref<string[]>([])
  const localTagOverrides = ref<Record<string, string[]>>({})
  const assetsQuery = useCmsStudioPaginatedQuery(
    api.ginkoCms.assets.getAssetManagerData,
    () => ({
      search: searchQuery.value.trim() || undefined,
      kind: typeFilter.value,
      deleted: sidebarMode.value === 'trash' ? ('trashed' as const) : ('active' as const),
      usage: usageFilter.value,
    }),
    { initialNumItems: ASSET_PAGE_SIZE },
  )

  const rawAssets = computed<FinderAssetRecord[]>(
    () => (assetsQuery.results.value as FinderAssetRecord[]) ?? [],
  )
  const assets = computed<FinderAssetRecord[]>(() =>
    rawAssets.value.map((asset) => {
      const override = localTagOverrides.value[asset.id]
      return override ? { ...asset, tags: override } : asset
    }),
  )
  const activeAssets = computed(() => assets.value.filter((asset) => asset.deletedAt == null))
  const trashedAssets = computed(() => assets.value.filter((asset) => asset.deletedAt != null))
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
    for (const asset of assets.value) {
      for (const tag of asset.tags) {
        if (next.has(tag)) continue
        next.set(tag, {
          key: tag,
          label: tag,
          color: tagPalette[next.size % tagPalette.length] ?? '#888888',
        })
      }
    }
    return next
  })

  const sidebarCollections = computed(() => {
    const byCollection = new Map<string, { label: string; count: number }>()
    for (const asset of activeAssets.value) {
      if (!asset.collectionSlug || !asset.collectionLabel) continue
      const current = byCollection.get(asset.collectionSlug)
      if (current) current.count += 1
      else byCollection.set(asset.collectionSlug, { label: asset.collectionLabel, count: 1 })
    }

    return [
      {
        key: 'global',
        label: t('ginkoCms.studio.assetBrowser.sharedLibrary'),
        icon: 'lucide:globe',
        count: activeAssets.value.filter((asset) => asset.scope === 'global').length,
      },
      ...Array.from(byCollection.entries())
        .sort((left, right) => left[1].label.localeCompare(right[1].label))
        .map(([key, value]) => ({
          key,
          label: value.label,
          icon: 'lucide:folder',
          count: value.count,
        })),
    ]
  })

  const sidebarTags = computed(() =>
    Array.from(tagMap.value.values())
      .map((tag) => ({
        ...tag,
        count: activeAssets.value.filter((asset) => asset.tags.includes(tag.key)).length,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  )

  const sidebarFullViews = computed(() => [
    {
      key: 'all',
      label: t('ginkoCms.studio.assetBrowser.allMedia'),
      icon: 'lucide:layers',
      count: activeAssets.value.length,
    },
    {
      key: 'global',
      label: t('ginkoCms.studio.assetBrowser.sharedLibrary'),
      icon: 'lucide:globe',
      count: activeAssets.value.filter((asset) => asset.scope === 'global').length,
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

  const trashCount = computed(() => trashedAssets.value.length)

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

    if (sidebarKey.value === 'global') {
      const segments: BreadcrumbSegment[] = [
        { label: t('ginkoCms.studio.assetBrowser.sharedLibrary'), drillPath: [] },
      ]
      for (let index = 0; index < drillPath.value.length; index++) {
        const segment = drillPath.value[index]!
        const path = drillPath.value.slice(0, index + 1)
        if (index === 0) {
          const collection = sidebarCollections.value.find((item) => item.key === segment)
          segments.push({ label: collection?.label ?? segment, drillPath: path })
          continue
        }
        const entryTitle =
          activeAssets.value.find((asset) => asset.entryId === segment)?.entryTitle ??
          trashedAssets.value.find((asset) => asset.entryId === segment)?.entryTitle ??
          segment
        segments.push({ label: entryTitle, drillPath: path })
      }
      return segments
    }

    const collection = sidebarCollections.value.find((item) => item.key === sidebarKey.value)
    const segments: BreadcrumbSegment[] = [
      { label: collection?.label ?? sidebarKey.value, drillPath: [] },
    ]
    for (let index = 0; index < drillPath.value.length; index++) {
      const segment = drillPath.value[index]!
      const path = drillPath.value.slice(0, index + 1)
      const entryTitle =
        activeAssets.value.find((asset) => asset.entryId === segment)?.entryTitle ??
        trashedAssets.value.find((asset) => asset.entryId === segment)?.entryTitle ??
        segment
      segments.push({ label: entryTitle, drillPath: path })
    }
    return segments
  })

  function buildCollectionItems(): FinderItem[] {
    const items: FinderItem[] = []
    const path = drillPath.value

    if (sidebarKey.value === 'global') {
      if (path.length === 0) {
        if (options.mode === 'pick') {
          const context = options.assetContext
          const seenAssetIds = new Set<string>()
          const pushAssets = (assetsToPush: FinderAssetRecord[]) => {
            for (const asset of assetsToPush) {
              if (seenAssetIds.has(asset.id)) continue
              seenAssetIds.add(asset.id)
              items.push({ type: 'asset', asset, tags: asset.tags })
            }
          }

          if (context?.entryId) {
            pushAssets(activeAssets.value.filter((asset) => asset.entryId === context.entryId))
          }
          if (context?.collectionId || context?.collectionSlug) {
            pushAssets(
              activeAssets.value.filter(
                (asset) =>
                  asset.scope === 'collection' &&
                  ((context.collectionId && asset.collectionId === context.collectionId) ||
                    (context.collectionSlug && asset.collectionSlug === context.collectionSlug)),
              ),
            )
          }
          pushAssets(activeAssets.value.filter((asset) => asset.scope === 'global'))

          for (const collection of sidebarCollections.value.filter(
            (item) => item.key !== 'global',
          )) {
            const collectionAssets = activeAssets.value.filter(
              (asset) => asset.collectionSlug === collection.key,
            )
            items.push({
              type: 'folder',
              id: collection.key,
              label: collection.label,
              icon: 'lucide:folder',
              count: collectionAssets.length,
              modifiedAt: latestAssetTimestamp(collectionAssets),
            })
          }
          return items
        }

        for (const collection of sidebarCollections.value.filter((item) => item.key !== 'global')) {
          const collectionAssets = activeAssets.value.filter(
            (asset) => asset.collectionSlug === collection.key,
          )
          items.push({
            type: 'folder',
            id: collection.key,
            label: collection.label,
            icon: 'lucide:folder',
            count: collectionAssets.length,
            modifiedAt: latestAssetTimestamp(collectionAssets),
          })
        }
        for (const asset of activeAssets.value.filter((asset) => asset.scope === 'global')) {
          items.push({ type: 'asset', asset, tags: asset.tags })
        }
        return items
      }

      if (path.length === 1) {
        const collectionSlug = path[0]!
        const entryAssets = activeAssets.value.filter(
          (asset) => asset.collectionSlug === collectionSlug && asset.entryId,
        )
        const seenEntries = new Set<string>()
        for (const asset of entryAssets) {
          if (!asset.entryId || seenEntries.has(asset.entryId)) continue
          const assetsForEntry = entryAssets.filter(
            (candidate) => candidate.entryId === asset.entryId,
          )
          seenEntries.add(asset.entryId)
          items.push({
            type: 'folder',
            id: asset.entryId,
            label: asset.entryTitle ?? asset.entryId,
            icon: 'lucide:file-text',
            count: assetsForEntry.length,
            modifiedAt: latestAssetTimestamp(assetsForEntry),
          })
        }
        for (const asset of activeAssets.value.filter(
          (candidate) =>
            candidate.scope === 'collection' && candidate.collectionSlug === collectionSlug,
        )) {
          items.push({ type: 'asset', asset, tags: asset.tags })
        }
        return items
      }

      const entryId = path[1]!
      for (const asset of activeAssets.value.filter((candidate) => candidate.entryId === entryId)) {
        items.push({ type: 'asset', asset, tags: asset.tags })
      }
      return items
    }

    if (path.length === 0) {
      const entryAssets = activeAssets.value.filter(
        (asset) => asset.collectionSlug === sidebarKey.value && asset.entryId,
      )
      const seenEntries = new Set<string>()
      for (const asset of entryAssets) {
        if (!asset.entryId || seenEntries.has(asset.entryId)) continue
        const assetsForEntry = entryAssets.filter(
          (candidate) => candidate.entryId === asset.entryId,
        )
        seenEntries.add(asset.entryId)
        items.push({
          type: 'folder',
          id: asset.entryId,
          label: asset.entryTitle ?? asset.entryId,
          icon: 'lucide:file-text',
          count: assetsForEntry.length,
          modifiedAt: latestAssetTimestamp(assetsForEntry),
        })
      }
      for (const asset of activeAssets.value.filter(
        (candidate) =>
          candidate.scope === 'collection' && candidate.collectionSlug === sidebarKey.value,
      )) {
        items.push({ type: 'asset', asset, tags: asset.tags })
      }
      return items
    }

    const entryId = path[0]!
    for (const asset of activeAssets.value.filter((candidate) => candidate.entryId === entryId)) {
      items.push({ type: 'asset', asset, tags: asset.tags })
    }
    return items
  }

  function buildTagItems(): FinderItem[] {
    return activeAssets.value
      .filter((asset) => asset.tags.includes(sidebarKey.value))
      .map((asset) => ({ type: 'asset' as const, asset, tags: asset.tags }))
  }

  function buildFullItems(): FinderItem[] {
    let scopedAssets = activeAssets.value
    if (sidebarKey.value === 'global') {
      scopedAssets = activeAssets.value.filter((asset) => asset.scope === 'global')
    } else if (sidebarKey.value !== 'all') {
      scopedAssets = activeAssets.value.filter((asset) => asset.collectionSlug === sidebarKey.value)
    }
    return scopedAssets.map((asset) => ({ type: 'asset' as const, asset, tags: asset.tags }))
  }

  function sortItems(items: FinderItem[]): FinderItem[] {
    const folders = items.filter((item): item is FinderFolder => item.type === 'folder')
    const assetItems = items.filter((item): item is FinderAssetItem => item.type === 'asset')

    folders.sort((left, right) => left.label.localeCompare(right.label))
    assetItems.sort((left, right) => {
      switch (sortBy.value) {
        case 'name':
          return left.asset.filename.localeCompare(right.asset.filename)
        case 'date':
          return (
            (right.asset.updatedAt ?? right.asset.createdAt) -
            (left.asset.updatedAt ?? left.asset.createdAt)
          )
        case 'size':
          return right.asset.size - left.asset.size
        case 'kind':
          return left.asset.mimeType.localeCompare(right.asset.mimeType)
        default:
          return 0
      }
    })

    return [...folders, ...assetItems]
  }

  const currentItems = computed<FinderItem[]>(() => {
    let items: FinderItem[]

    if (sidebarMode.value === 'trash') {
      items = trashedAssets.value.map((asset) => ({
        type: 'asset' as const,
        asset,
        tags: asset.tags,
      }))
    } else if (sidebarMode.value === 'tags') {
      items = buildTagItems()
    } else if (sidebarMode.value === 'full') {
      items = buildFullItems()
    } else {
      items = buildCollectionItems()
    }

    if (timeFilter.value !== 'any') {
      const now = Date.now()
      const windows: Record<string, number> = {
        '24h': 86_400_000,
        '7d': 604_800_000,
        '30d': 2_592_000_000,
        '90d': 7_776_000_000,
      }
      const cutoff = now - (windows[timeFilter.value] ?? 0)
      items = items.filter((item) => {
        if (item.type === 'folder') return true
        return item.asset.createdAt >= cutoff
      })
    }

    if (sizeFilter.value !== 'any') {
      items = items.filter((item) => {
        if (item.type === 'folder') return true
        switch (sizeFilter.value) {
          case 'small':
            return item.asset.size < 102_400
          case 'medium':
            return item.asset.size >= 102_400 && item.asset.size < 1_048_576
          case 'large':
            return item.asset.size >= 1_048_576
          default:
            return true
        }
      })
    }

    if (
      options.mode === 'pick' &&
      sidebarMode.value === 'collections' &&
      sidebarKey.value === 'global' &&
      drillPath.value.length === 0
    ) {
      return items
    }
    return sortItems(items)
  })

  const selectedAsset = computed(() =>
    selectedAssetId.value
      ? (assets.value.find((asset) => asset.id === selectedAssetId.value) ?? null)
      : null,
  )

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

  watch(visibleAssetIds, (ids) => {
    const visible = new Set(ids)
    selectedAssetIds.value = selectedAssetIds.value.filter((id) => visible.has(id))
  })

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
        const storageId = await upload.upload(file)
        if (typeof storageId !== 'string') {
          throw new TypeError('Upload did not return a storage id.')
        }
        const context = options.assetContext
        const scope =
          uploadDestination.value === 'global'
            ? 'global'
            : uploadDestination.value === 'collection'
              ? 'collection'
              : context?.entryId
                ? 'entry'
                : context?.collectionId || context?.collectionSlug
                  ? 'collection'
                  : 'global'
        const assetId = await registerAssetAction({
          storageId,
          filename: file.name,
          scope,
          ...(scope === 'entry' ? { entryId: context?.entryId } : {}),
          ...(scope !== 'global' ? { collectionId: context?.collectionId } : {}),
          ...(scope !== 'global' ? { collectionSlug: context?.collectionSlug } : {}),
        })
        if (typeof assetId === 'string') await context?.onAssetRegistered?.(assetId)
        if (typeof assetId === 'string') options.onAssetUploaded?.(assetId)
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to upload asset.')
    } finally {
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

  async function trashAssets(assetIds: string[]) {
    const selectedAssets = assetIds
      .map((id) => assets.value.find((asset) => asset.id === id) ?? null)
      .filter((asset): asset is FinderAssetRecord => asset !== null)
    if (selectedAssets.length === 0) return

    actionPending.value = true
    error.value = ''
    try {
      for (const asset of selectedAssets) {
        const assetForce = asset.usages.length > 0
        const token = await previewTrashAsset(asset, assetForce)
        await trashAssetMutation({
          assetId: asset.id,
          force: assetForce ? true : undefined,
          _confirmationToken: token,
        })
      }
      selectedAssetIds.value = selectedAssetIds.value.filter((id) => !assetIds.includes(id))
      if (
        selectedAsset.value &&
        assetIds.includes(selectedAsset.value.id) &&
        sidebarMode.value !== 'trash'
      ) {
        selectedAssetId.value = null
      }
    } catch (cause) {
      error.value = getCmsErrorMessage(cause, 'Failed to move assets to trash.')
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
    if (!selectedAsset.value?.collectionId) return
    actionPending.value = true
    error.value = ''
    try {
      await moveAssetMutation({
        assetId: selectedAsset.value.id,
        scope: 'collection',
        collectionId: selectedAsset.value.collectionId,
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
      (asset) => asset.scope !== 'entry' || !asset.collectionId,
    )
    if (incompatible.length > 0) {
      error.value = 'Only entry-owned assets with a collection can be shared in collection.'
      return
    }
    actionPending.value = true
    error.value = ''
    try {
      for (const asset of selectedAssets) {
        if (!asset.collectionId) continue
        await moveAssetMutation({
          assetId: asset.id,
          scope: 'collection',
          collectionId: asset.collectionId,
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
    error,
    actionPending,
    addTagToSelectedAsset,
    removeTagFromSelectedAsset,
    applyTagToSelection,
    setSelectedAssetTags,
    trashAssets,
    restoreSelectedAsset,
    moveSelectedAssetToCollection,
    moveSelectedAssetToGlobal,
    moveAssetsToCollection,
    moveAssetsToGlobal,
    tagMap,
  }
}
