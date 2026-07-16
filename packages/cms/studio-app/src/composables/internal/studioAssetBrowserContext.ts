import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, inject, provide, ref, watch, type ComputedRef, type Ref } from 'vue'

import type { useCmsStudioSettings } from '../useCmsStudioSettings'
import { useStudioAssetSelection } from '../useStudioAssetSelection'
import {
  assetFinderItemKey,
  assetOwnerPathLabel,
  assetOwnershipLabel,
  assetPreviewKey,
} from './assetBrowserPresentation'
import type {
  FinderAssetRecord,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from './assetFinderTypes'
import { finderAssetToStudioAsset, mimeTypeMatches, parseAspectRatio } from './assetFinderUtils'
import type { StudioAssetContext, StudioAssetRecord } from './types'
import type { useStudioAssetFinder } from './useStudioAssetFinder'
import { useStudioAssetMetadata } from './useStudioAssetMetadata'

/**
 * Context seam for the decomposed StudioAssetBrowser (mirrors
 * studioEntryEditorContext). The shell calls useStudioAssetFinder, then
 * assembles this ONCE via createStudioAssetBrowserContext and provides it; the
 * extracted nav / toolbar / view / detail components inject it.
 *
 * One flat object with grouped sub-objects (finder / mode / pick / metadata /
 * tags / presentation / selection / flow / trash) so a consumer reaches, e.g.,
 * ctx.metadata.altText or ctx.finder.currentItems.
 */

type StudioAssetFinder = ReturnType<typeof useStudioAssetFinder>
type StudioSettings = ReturnType<typeof useCmsStudioSettings>
type Translate = (key: string, params?: Record<string, unknown>) => string
type UpdateAssetMutation = Parameters<typeof useStudioAssetMetadata>[0]['updateAsset']

export interface StudioAssetBrowserProps {
  mode: StudioAssetBrowserMode
  assetContext?: StudioAssetContext
  acceptedTypes?: string[]
  aspectRatio: string | null
  modelValue: string | string[] | null
  multiple?: boolean
  title?: string
  embedded?: boolean
}

export interface StudioAssetBrowserEmit {
  (event: 'select-asset', asset: StudioAssetRecord): void
  (event: 'update:modelValue', value: string | string[]): void
  (event: 'uploaded', assetId: string): void
  (event: 'close'): void
}

export interface UploadDestinationOption {
  value: string
  label: string
  disabled: boolean
}

export type PendingDestructiveAssetAction =
  | { kind: 'trash'; asset: FinderAssetRecord }
  | { kind: 'bulk-trash'; assetIds: string[]; usageCount: number }
  | null

export async function executePendingAssetTrash(
  action: Exclude<PendingDestructiveAssetAction, null>,
  trashAssets: (assetIds: string[]) => Promise<unknown>,
) {
  await trashAssets(action.kind === 'bulk-trash' ? action.assetIds : [action.asset.id])
}

export interface CreateStudioAssetBrowserContextOptions {
  finder: StudioAssetFinder
  props: StudioAssetBrowserProps
  emit: StudioAssetBrowserEmit
  t: Translate
  studioSettings: StudioSettings
  updateAsset: UpdateAssetMutation
  /** Owned by the shell so the finder's onAssetUploaded callback can set it. */
  pendingUploadedAssetId: Ref<string | null>
}

export function createStudioAssetBrowserContext(options: CreateStudioAssetBrowserContextOptions) {
  const { finder, props, emit, t, studioSettings, updateAsset, pendingUploadedAssetId } = options

  // ── mode ────────────────────────────────────────────────────────────────
  const isPickMode = computed(() => props.mode === 'pick')
  const acceptedTypes = computed(() => props.acceptedTypes?.filter(Boolean) ?? [])
  const inputAccept = computed(() => acceptedTypes.value.join(',') || undefined)

  // ── metadata-draft + tag-input state ─────────────────────────────────────
  const selectedTagInput = ref('')
  const bulkTagInput = ref('')
  const failedPreviewKeys = ref<Set<string>>(new Set())
  const localError = ref('')

  // ── flow (mobile sheets, filter row, destructive intent) ─────────────────
  const mobileScopesOpen = ref(false)
  const mobileDetailsOpen = ref(false)
  const mobileFiltersOpen = ref(false)
  const pendingDestructiveAssetAction = ref<PendingDestructiveAssetAction>(null)

  // ── presentation helpers ─────────────────────────────────────────────────
  function canShowPreview(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
    return Boolean(asset.thumbnailUrl) && !failedPreviewKeys.value.has(assetPreviewKey(asset))
  }

  function markPreviewFailed(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
    const key = assetPreviewKey(asset)
    if (failedPreviewKeys.value.has(key)) return
    failedPreviewKeys.value = new Set([...failedPreviewKeys.value, key])
  }

  // ── selection / pick state ───────────────────────────────────────────────
  const normalizedValue = computed(() => {
    if (Array.isArray(props.modelValue)) return props.modelValue
    if (typeof props.modelValue === 'string' && props.modelValue.length > 0)
      return [props.modelValue]
    return []
  })

  const selectedAssetForDetails = computed(() => {
    if (finder.selectedAsset.value) return finder.selectedAsset.value
    const selectedId = normalizedValue.value[0]
    return selectedId
      ? (finder.assets.value.find((asset) => asset.id === selectedId) ?? null)
      : null
  })

  const drawerOpen = computed({
    get: () => props.mode === 'manage' && !!finder.selectedAsset.value,
    set: (open) => {
      if (!open) finder.selectAsset(null)
    },
  })

  const selectedVisibleAssets = computed(() => {
    const ids = new Set(finder.selectedVisibleAssetIds.value)
    return finder.assets.value.filter((asset) => ids.has(asset.id))
  })
  const canBulkShareInCollection = computed(
    () =>
      selectedVisibleAssets.value.length > 0 &&
      selectedVisibleAssets.value.every((asset) => asset.scope === 'entry' && asset.collectionId),
  )
  const canBulkMakeGlobal = computed(() =>
    selectedVisibleAssets.value.some((asset) => asset.scope !== 'global'),
  )
  const metadata = useStudioAssetMetadata({
    selectedAsset: selectedAssetForDetails,
    assetContext: () => props.assetContext,
    studioSettings,
    updateAsset,
    localError,
    t,
  })

  // ── upload destinations ──────────────────────────────────────────────────
  const uploadDestinations = computed<UploadDestinationOption[]>(() => [
    {
      value: 'context',
      label: props.assetContext?.entryId
        ? t('ginkoCms.studio.assetBrowser.destThisEntry')
        : props.assetContext?.collectionSlug || props.assetContext?.collectionId
          ? t('ginkoCms.studio.assetBrowser.destThisCollection')
          : t('ginkoCms.studio.assetBrowser.destGlobal'),
      disabled: false,
    },
    {
      value: 'collection',
      label: props.assetContext?.collectionSlug
        ? t('ginkoCms.studio.assetBrowser.destCollectionNamed', {
            slug: props.assetContext.collectionSlug,
          })
        : t('ginkoCms.studio.assetBrowser.destCollection'),
      disabled: !props.assetContext?.collectionSlug && !props.assetContext?.collectionId,
    },
    {
      value: 'global',
      label: t('ginkoCms.studio.assetBrowser.destSharedLibrary'),
      disabled: false,
    },
  ])

  // ── status bar ───────────────────────────────────────────────────────────
  const statusText = computed(() => {
    const parts: string[] = []
    if (finder.folderCount.value > 0)
      parts.push(
        t(
          finder.folderCount.value === 1
            ? 'ginkoCms.studio.assetBrowser.statusFoldersOne'
            : 'ginkoCms.studio.assetBrowser.statusFoldersOther',
          { count: finder.folderCount.value },
        ),
      )
    if (finder.assetCount.value > 0)
      parts.push(
        t(
          finder.assetCount.value === 1
            ? 'ginkoCms.studio.assetBrowser.statusFilesOne'
            : 'ginkoCms.studio.assetBrowser.statusFilesOther',
          { count: finder.assetCount.value },
        ),
      )
    return parts.join(', ') || t('ginkoCms.studio.assetBrowser.statusEmpty')
  })

  // ── pick flow ────────────────────────────────────────────────────────────
  function isChosen(assetId: string): boolean {
    return normalizedValue.value.includes(assetId)
  }

  function assertAssetAllowed(asset: Pick<FinderAssetRecord, 'mimeType' | 'width' | 'height'>) {
    if (
      acceptedTypes.value.length > 0 &&
      !acceptedTypes.value.some((acceptedType) => mimeTypeMatches(acceptedType, asset.mimeType))
    ) {
      throw new Error(
        t('ginkoCms.studio.assetBrowser.typeNotAllowed', {
          type: asset.mimeType || t('ginkoCms.studio.assetBrowser.typeUnknown'),
        }),
      )
    }

    const expectedRatio = parseAspectRatio(props.aspectRatio)
    if (!expectedRatio || !asset.width || !asset.height) return

    const actualRatio = asset.width / asset.height
    const tolerance = 0.01
    if (Math.abs(actualRatio - expectedRatio) / expectedRatio > tolerance) {
      throw new Error(
        t('ginkoCms.studio.assetBrowser.aspectRatioError', { ratio: props.aspectRatio }),
      )
    }
  }

  function chooseAsset(asset: FinderAssetRecord) {
    localError.value = ''
    try {
      assertAssetAllowed(asset)
    } catch (cause) {
      localError.value = getCmsErrorMessage(cause, t('ginkoCms.studio.assetPicker.uploadError'))
      return
    }

    const value = props.multiple
      ? isChosen(asset.id)
        ? normalizedValue.value.filter((id) => id !== asset.id)
        : [...normalizedValue.value, asset.id]
      : asset.id
    emit('update:modelValue', value)
    emit('select-asset', finderAssetToStudioAsset(asset))
    mobileDetailsOpen.value = false
    if (!props.multiple) emit('close')
  }

  function togglePickerSelection(asset: FinderAssetRecord) {
    finder.selectAsset(asset.id)
    chooseAsset(asset)
  }

  // ── item flow ────────────────────────────────────────────────────────────
  function handleItemClick(item: FinderItem) {
    if (item.type === 'folder') {
      finder.drillInto(item.id)
      return
    }
    finder.selectAsset(item.asset.id)
    mobileDetailsOpen.value = true
  }

  function handleItemDoubleClick(item: FinderItem) {
    if (item.type === 'folder') {
      finder.drillInto(item.id)
      return
    }
    if (isPickMode.value) chooseAsset(item.asset)
  }

  function selectMobileSidebar(mode: SidebarMode, key: string) {
    finder.selectSidebar(mode, key)
    mobileScopesOpen.value = false
  }

  // ── tag inputs ───────────────────────────────────────────────────────────
  function commitSelectedTag() {
    if (!selectedTagInput.value.trim()) return
    void finder.addTagToSelectedAsset(selectedTagInput.value)
    selectedTagInput.value = ''
  }

  function commitBulkTag(mode: 'add' | 'remove') {
    if (!bulkTagInput.value.trim()) return
    void finder.applyTagToSelection(bulkTagInput.value, mode)
    bulkTagInput.value = ''
  }

  function handleSelectedTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitSelectedTag()
    }
  }

  function handleBulkTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitBulkTag('add')
    }
  }

  // ── destructive flow ─────────────────────────────────────────────────────
  function requestTrashSelectedAssets() {
    const ids = [...finder.selectedVisibleAssetIds.value]
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const usageCount = finder.assets.value
      .filter((asset) => idSet.has(asset.id))
      .reduce((sum, asset) => sum + asset.usages.length, 0)
    pendingDestructiveAssetAction.value = { kind: 'bulk-trash', assetIds: ids, usageCount }
  }

  function requestTrashAsset(asset: FinderAssetRecord | null) {
    if (!asset) return
    pendingDestructiveAssetAction.value = { kind: 'trash', asset }
  }

  async function confirmDestructiveAssetAction() {
    const action = pendingDestructiveAssetAction.value
    if (!action) return
    await executePendingAssetTrash(action, finder.trashAssets)
    pendingDestructiveAssetAction.value = null
  }

  function handleDestructiveDialogOpen(open: boolean) {
    if (!open) pendingDestructiveAssetAction.value = null
  }

  // ── watchers ─────────────────────────────────────────────────────────────
  watch(
    finder.assets,
    (nextAssets) => {
      const pendingId = pendingUploadedAssetId.value
      if (!pendingId) return
      const uploadedAsset = nextAssets.find((asset) => asset.id === pendingId)
      if (!uploadedAsset) return
      pendingUploadedAssetId.value = null
      finder.selectAsset(uploadedAsset.id)
      if (isPickMode.value) chooseAsset(uploadedAsset)
    },
    { deep: true },
  )

  // Publish the current selection to the page-level controller (when present)
  // so the right-sidebar asset-details panel can render it (RFC Phase 5 step 5
  // / D4). Optional inject: the picker context has no provider and simply skips.
  const assetSelection = useStudioAssetSelection()
  if (assetSelection) {
    watch(
      () => selectedAssetForDetails.value?.id ?? null,
      (id) => {
        assetSelection.selectedAssetId.value = id
      },
      { immediate: true },
    )
    watch(
      () => props.assetContext,
      (context) => {
        assetSelection.assetContext.value = context
      },
      { immediate: true },
    )
  }

  return {
    finder,
    mode: {
      mode: computed(() => props.mode),
      isPickMode,
      embedded: computed(() => props.embedded ?? false),
      multiple: computed(() => props.multiple ?? false),
      title: computed(() => props.title ?? t('ginkoCms.studio.assetBrowser.title')),
      inputAccept,
      acceptedTypes,
    },
    pick: {
      normalizedValue,
      isChosen,
      chooseAsset,
      togglePickerSelection,
      uploadDestinations,
    },
    metadata,
    tags: {
      selectedTagInput,
      bulkTagInput,
      commitSelectedTag,
      commitBulkTag,
      handleSelectedTagKeydown,
      handleBulkTagKeydown,
    },
    presentation: {
      ownerPathLabel: (asset: Pick<FinderAssetRecord, 'ownerPath'>) =>
        assetOwnerPathLabel(t, asset),
      ownershipLabel: (asset: Pick<FinderAssetRecord, 'scope' | 'collectionLabel'>) =>
        assetOwnershipLabel(t, asset),
      canShowPreview,
      markPreviewFailed,
      itemKey: assetFinderItemKey,
      statusText,
    },
    selection: {
      selectedAssetForDetails,
      drawerOpen,
      canBulkShareInCollection,
      canBulkMakeGlobal,
    },
    flow: {
      mobileScopesOpen,
      mobileDetailsOpen,
      mobileFiltersOpen,
      localError,
      handleItemClick,
      handleItemDoubleClick,
      selectMobileSidebar,
      requestTrashAsset,
      requestTrashSelectedAssets,
    },
    trash: {
      pendingDestructiveAssetAction,
      confirmDestructiveAssetAction,
      handleDestructiveDialogOpen,
    },
  }
}

export type StudioAssetBrowserContext = ReturnType<typeof createStudioAssetBrowserContext>

const studioAssetBrowserContextKey = Symbol('studio-asset-browser-context')

export function provideStudioAssetBrowserContext(context: StudioAssetBrowserContext) {
  provide(studioAssetBrowserContextKey, context)
}

export function useStudioAssetBrowserContext(): StudioAssetBrowserContext {
  const context = inject<StudioAssetBrowserContext | null>(studioAssetBrowserContextKey, null)
  if (!context) {
    throw new Error('Studio asset browser context is not available')
  }
  return context
}

// Re-exported for consumers that only need the presentation-facing types.
export type { FinderAssetRecord, FinderItem, StudioAssetBrowserMode }
export type StudioAssetBrowserContextComputed = ComputedRef<StudioAssetBrowserContext>
