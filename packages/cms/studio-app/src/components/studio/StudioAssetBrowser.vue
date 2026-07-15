<script setup lang="ts">
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Globe,
  Grid3x3,
  Link,
  List,
  Loader2,
  Menu,
  PanelRight,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from '@lucide/vue'
import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import type {
  FinderAssetRecord,
  FinderItem,
  SidebarMode,
  StudioAssetBrowserMode,
} from '../../composables/internal/assetFinderTypes'
import {
  finderAssetToStudioAsset,
  mimeKind,
  mimeTypeMatches,
  parseAspectRatio,
} from '../../composables/internal/assetFinderUtils'
import type { StudioAssetContext, StudioAssetRecord } from '../../composables/internal/types'
import { useStudioAssetFinder } from '../../composables/internal/useStudioAssetFinder'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useStudioAssetSelection } from '../../composables/useStudioAssetSelection'
import { useConvexMutation } from '../../composables/useStudioConvex'
import Sheet from '../ui/sheet/Sheet.vue'
import SheetContent from '../ui/sheet/SheetContent.vue'
import SheetDescription from '../ui/sheet/SheetDescription.vue'
import SheetHeader from '../ui/sheet/SheetHeader.vue'
import SheetTitle from '../ui/sheet/SheetTitle.vue'
import StudioAssetMobileFilters from './assets/StudioAssetMobileFilters.vue'
import StudioAssetMobileScopes from './assets/StudioAssetMobileScopes.vue'

const props = withDefaults(
  defineProps<{
    mode?: StudioAssetBrowserMode
    assetContext?: StudioAssetContext
    acceptedTypes?: string[]
    aspectRatio?: string | null
    modelValue?: string | string[] | null
    multiple?: boolean
    title?: string
    embedded?: boolean
  }>(),
  {
    mode: 'manage',
    aspectRatio: null,
    modelValue: null,
  },
)

const emit = defineEmits<{
  'select-asset': [asset: StudioAssetRecord]
  'update:modelValue': [value: string | string[]]
  uploaded: [assetId: string]
  close: []
}>()

const isPickMode = computed(() => props.mode === 'pick')
const activeLocale = ref('')
const selectedTagInput = ref('')
const bulkTagInput = ref('')
const altDrafts = ref<Record<string, string>>({})
const captionDrafts = ref<Record<string, string>>({})
const failedPreviewKeys = ref<Set<string>>(new Set())
const savingMeta = ref(false)
const localError = ref('')
const pendingUploadedAssetId = ref<string | null>(null)
const mobileScopesOpen = ref(false)
const mobileDetailsOpen = ref(false)
const mobileFiltersOpen = ref(false)
const pendingDestructiveAssetAction = ref<
  | { kind: 'trash'; asset: FinderAssetRecord }
  | { kind: 'bulk-trash'; assetIds: string[]; usageCount: number }
  | null
>(null)

const acceptedTypes = computed(() => props.acceptedTypes?.filter(Boolean) ?? [])
const inputAccept = computed(() => acceptedTypes.value.join(',') || undefined)
const initialTypeFilter = computed(() =>
  acceptedTypes.value.some((type) => type === 'image/*' || type.startsWith('image/'))
    ? 'image'
    : 'all',
)

const {
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
  trashSelectedAsset,
  trashAssets,
  restoreSelectedAsset,
  moveSelectedAssetToCollection,
  moveSelectedAssetToGlobal,
  moveAssetsToCollection,
  moveAssetsToGlobal,
} = useStudioAssetFinder({
  allowedTypes: acceptedTypes.value,
  aspectRatio: props.aspectRatio,
  assetContext: props.assetContext,
  initialTypeFilter: initialTypeFilter.value,
  mode: props.mode,
  onAssetUploaded: (assetId) => {
    pendingUploadedAssetId.value = assetId
    emit('uploaded', assetId)
  },
})

const ownerPathLabel = (asset: Pick<FinderAssetRecord, 'ownerPath'>) =>
  asset.ownerPath?.length ? asset.ownerPath.join(' / ') : t('ginkoCms.studio.assetBrowser.globalPath')

const ownershipLabel = (asset: Pick<FinderAssetRecord, 'scope' | 'collectionLabel'>) => {
  if (asset.scope === 'global') return t('ginkoCms.studio.assetBrowser.ownershipGlobalAsset')
  if (asset.scope === 'collection') return t('ginkoCms.studio.assetBrowser.ownershipCollection', { label: asset.collectionLabel ?? t('ginkoCms.studio.assetBrowser.ownershipCollectionFallback') })
  return t('ginkoCms.studio.assetBrowser.ownershipEntry')
}

function localeTextHasValue(value: LocaleText | string | null | undefined, locale: string) {
  if (typeof value === 'string') {
    return locale === (studioSettings.defaultLocale.value ?? 'en') && value.trim().length > 0
  }
  if (!value || typeof value !== 'object') return false
  const text = value[locale]
  return typeof text === 'string' && text.trim().length > 0
}

function metadataCoverage(asset: Pick<FinderAssetRecord, 'alt' | 'caption'>) {
  const locales = localeOptions.value.map((locale) => locale.code)
  const missingAlt = locales.filter((locale) => !localeTextHasValue(asset.alt, locale))
  const missingCaption = locales.filter((locale) => !localeTextHasValue(asset.caption, locale))
  return {
    complete: missingAlt.length === 0 && missingCaption.length === 0,
    missingAlt,
    missingCaption,
  }
}

function metadataCoverageLabel(asset: Pick<FinderAssetRecord, 'alt' | 'caption'>) {
  const coverage = metadataCoverage(asset)
  if (coverage.complete) return t('ginkoCms.studio.assetBrowser.detailsComplete')
  const missing = new Set([...coverage.missingAlt, ...coverage.missingCaption])
  return t('ginkoCms.studio.assetBrowser.missingDetails', { locales: Array.from(missing).join(', ').toUpperCase() })
}

function previewKey(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
  return `${asset.id}:${asset.thumbnailUrl ?? ''}`
}

function canShowPreview(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
  return Boolean(asset.thumbnailUrl) && !failedPreviewKeys.value.has(previewKey(asset))
}

function markPreviewFailed(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
  const key = previewKey(asset)
  if (failedPreviewKeys.value.has(key)) return
  failedPreviewKeys.value = new Set([...failedPreviewKeys.value, key])
}

const canCopyDefaultMetadata = computed(() => {
  const asset = selectedAssetForDetails.value
  if (!asset) return false
  const defaultLocale = studioSettings.defaultLocale.value ?? 'en'
  const defaultAlt = altDrafts.value[defaultLocale]?.trim()
  const defaultCaption = captionDrafts.value[defaultLocale]?.trim()
  if (!defaultAlt && !defaultCaption) return false
  const coverage = metadataCoverage(asset)
  return coverage.missingAlt.length > 0 || coverage.missingCaption.length > 0
})

const uploadDestinations = computed(() => [
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
      ? t('ginkoCms.studio.assetBrowser.destCollectionNamed', { slug: props.assetContext.collectionSlug })
      : t('ginkoCms.studio.assetBrowser.destCollection'),
    disabled: !props.assetContext?.collectionSlug && !props.assetContext?.collectionId,
  },
  {
    value: 'global',
    label: t('ginkoCms.studio.assetBrowser.destSharedLibrary'),
    disabled: false,
  },
])

// On-demand filter row; pins itself open while any filter is active.
const filtersOpen = ref(false)
const showFilterRow = computed(() => filtersOpen.value || activeFilterCount.value > 0)

const { t } = useCmsI18n()
const viewSegments = [
  { value: 'list', label: t('ginkoCms.studio.assetBrowser.viewList'), icon: List },
  { value: 'grid', label: t('ginkoCms.studio.assetBrowser.viewGrid'), icon: Grid3x3 },
]

const selectedVisibleAssets = computed(() => {
  const ids = new Set(selectedVisibleAssetIds.value)
  return assets.value.filter((asset) => ids.has(asset.id))
})
const canBulkShareInCollection = computed(
  () =>
    selectedVisibleAssets.value.length > 0 &&
    selectedVisibleAssets.value.every((asset) => asset.scope === 'entry' && asset.collectionId),
)
const canBulkMakeGlobal = computed(() =>
  selectedVisibleAssets.value.some((asset) => asset.scope !== 'global'),
)

const updateAsset = useConvexMutation(api.ginkoCms.assets.updateAsset)
const studioSettings = useCmsStudioSettings()

const normalizedValue = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue
  if (typeof props.modelValue === 'string' && props.modelValue.length > 0) return [props.modelValue]
  return []
})

const selectedAssetForDetails = computed(() => {
  if (selectedAsset.value) return selectedAsset.value
  const selectedId = normalizedValue.value[0]
  return selectedId ? (assets.value.find((asset) => asset.id === selectedId) ?? null) : null
})

const drawerOpen = computed({
  get: () => props.mode === 'manage' && !!selectedAsset.value,
  set: (open) => {
    if (!open) selectAsset(null)
  },
})

// Publish the current selection to the page-level controller (when present) so
// the right-sidebar asset-details panel can render it (RFC Phase 5 step 5 / D4).
// Optional inject: the picker context has no provider and simply skips this.
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

const pendingDestructiveActionTitle = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return ''
  if (action.kind === 'bulk-trash') return t('ginkoCms.studio.assetBrowser.bulkTrashTitle')
  return t('ginkoCms.studio.assetBrowser.trashTitle')
})

const pendingDestructiveActionDescription = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return ''
  return t('ginkoCms.studio.assetBrowser.trashDescription')
})

const pendingDestructiveConfirmLabel = computed(() => {
  return t('ginkoCms.studio.assetBrowser.moveToTrashConfirm')
})

const pendingDestructiveUsageCount = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return 0
  if (action.kind === 'bulk-trash') return action.usageCount
  return action.asset.usages.length
})

const pendingDestructiveAffectedAssets = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return []
  if (action.kind === 'bulk-trash') {
    const ids = new Set(action.assetIds)
    return assets.value.filter((asset) => ids.has(asset.id))
  }
  return [action.asset]
})

function requestTrashSelectedAssets() {
  const ids = [...selectedVisibleAssetIds.value]
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const usageCount = assets.value
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
  if (action.kind === 'bulk-trash') {
    await trashAssets(action.assetIds)
  } else {
    selectAsset(action.asset.id)
    await trashSelectedAsset()
  }
  pendingDestructiveAssetAction.value = null
}

function handleDestructiveDialogOpen(open: boolean) {
  if (!open) pendingDestructiveAssetAction.value = null
}

const statusText = computed(() => {
  const parts: string[] = []
  if (folderCount.value > 0)
    parts.push(t(folderCount.value === 1 ? 'ginkoCms.studio.assetBrowser.statusFoldersOne' : 'ginkoCms.studio.assetBrowser.statusFoldersOther', { count: folderCount.value }))
  if (assetCount.value > 0)
    parts.push(t(assetCount.value === 1 ? 'ginkoCms.studio.assetBrowser.statusFilesOne' : 'ginkoCms.studio.assetBrowser.statusFilesOther', { count: assetCount.value }))
  return parts.join(', ') || t('ginkoCms.studio.assetBrowser.statusEmpty')
})

const localeOptions = computed(() => {
  const configured = studioSettings.locales.value.map((locale) => ({
    code: locale.code,
    label: locale.label || locale.code,
    isDefault: locale.code === studioSettings.defaultLocale.value,
  }))
  const preferredCodes = [
    props.assetContext?.locale,
    studioSettings.defaultLocale.value,
    configured[0]?.code,
    'en',
  ].filter((code): code is string => !!code)

  const byCode = new Map(configured.map((locale) => [locale.code, locale]))
  for (const code of preferredCodes) {
    if (!byCode.has(code)) byCode.set(code, { code, label: code, isDefault: false })
  }
  return Array.from(byCode.values())
})

const preferredLocale = computed(
  () => props.assetContext?.locale ?? studioSettings.defaultLocale.value ?? 'en',
)

const altText = computed({
  get: () => altDrafts.value[activeLocale.value] ?? '',
  set: (value: string) => {
    altDrafts.value = { ...altDrafts.value, [activeLocale.value]: value }
  },
})

const captionText = computed({
  get: () => captionDrafts.value[activeLocale.value] ?? '',
  set: (value: string) => {
    captionDrafts.value = { ...captionDrafts.value, [activeLocale.value]: value }
  },
})

watch(
  [selectedAssetForDetails, preferredLocale],
  ([asset, locale]) => {
    if (!asset) {
      altDrafts.value = {}
      captionDrafts.value = {}
      activeLocale.value = locale
      return
    }
    altDrafts.value = localeTextToDrafts(asset.alt)
    captionDrafts.value = localeTextToDrafts(asset.caption)
    activeLocale.value = localeOptions.value.some((option) => option.code === locale)
      ? locale
      : (localeOptions.value[0]?.code ?? 'en')
  },
  { immediate: true },
)

watch(
  assets,
  (nextAssets) => {
    const pendingId = pendingUploadedAssetId.value
    if (!pendingId) return
    const uploadedAsset = nextAssets.find((asset) => asset.id === pendingId)
    if (!uploadedAsset) return
    pendingUploadedAssetId.value = null
    selectAsset(uploadedAsset.id)
    if (isPickMode.value) chooseAsset(uploadedAsset)
  },
  { deep: true },
)

function localeTextToDrafts(value: LocaleText | string | null | undefined): Record<string, string> {
  if (typeof value === 'string') return { [studioSettings.defaultLocale.value ?? 'en']: value }
  if (!value || typeof value !== 'object') return {}
  return { ...value }
}

function mergeLocaleText(
  existing: LocaleText | string | null | undefined,
  drafts: Record<string, string>,
): LocaleText {
  return {
    ...(typeof existing === 'object' && existing !== null ? existing : {}),
    ...drafts,
  }
}

function itemKey(item: FinderItem): string {
  return item.type === 'folder' ? `f:${item.id}` : `a:${item.asset.id}`
}

function isChosen(assetId: string): boolean {
  return normalizedValue.value.includes(assetId)
}

function assertAssetAllowed(asset: Pick<FinderAssetRecord, 'mimeType' | 'width' | 'height'>) {
  if (
    acceptedTypes.value.length > 0 &&
    !acceptedTypes.value.some((acceptedType) => mimeTypeMatches(acceptedType, asset.mimeType))
  ) {
    throw new Error(t('ginkoCms.studio.assetBrowser.typeNotAllowed', { type: asset.mimeType || t('ginkoCms.studio.assetBrowser.typeUnknown') }))
  }

  const expectedRatio = parseAspectRatio(props.aspectRatio)
  if (!expectedRatio || !asset.width || !asset.height) return

  const actualRatio = asset.width / asset.height
  const tolerance = 0.01
  if (Math.abs(actualRatio - expectedRatio) / expectedRatio > tolerance) {
    throw new Error(t('ginkoCms.studio.assetBrowser.aspectRatioError', { ratio: props.aspectRatio }))
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

function handleItemClick(item: FinderItem) {
  if (item.type === 'folder') {
    drillInto(item.id)
    return
  }
  selectAsset(item.asset.id)
  mobileDetailsOpen.value = true
}

function selectMobileSidebar(mode: SidebarMode, key: string) {
  selectSidebar(mode, key)
  mobileScopesOpen.value = false
}

function handleItemDoubleClick(item: FinderItem) {
  if (item.type === 'folder') {
    drillInto(item.id)
    return
  }
  if (isPickMode.value) chooseAsset(item.asset)
}

function togglePickerSelection(asset: FinderAssetRecord) {
  selectAsset(asset.id)
  chooseAsset(asset)
}

function commitSelectedTag() {
  if (!selectedTagInput.value.trim()) return
  void addTagToSelectedAsset(selectedTagInput.value)
  selectedTagInput.value = ''
}

function commitBulkTag(mode: 'add' | 'remove') {
  if (!bulkTagInput.value.trim()) return
  void applyTagToSelection(bulkTagInput.value, mode)
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

async function saveMetadata() {
  const asset = selectedAssetForDetails.value
  if (!asset) return
  savingMeta.value = true
  localError.value = ''
  try {
    await updateAsset({
      assetId: asset.id,
      alt: mergeLocaleText(asset.alt, altDrafts.value),
      caption: mergeLocaleText(asset.caption, captionDrafts.value),
    })
  } catch (cause) {
    localError.value = getCmsErrorMessage(cause, t('ginkoCms.studio.assetPicker.saveMetadataError'))
  } finally {
    savingMeta.value = false
  }
}

async function copyDefaultMetadataToMissingLocales() {
  const asset = selectedAssetForDetails.value
  if (!asset) return
  const defaultLocale = studioSettings.defaultLocale.value ?? 'en'
  const defaultAlt = altDrafts.value[defaultLocale]?.trim()
  const defaultCaption = captionDrafts.value[defaultLocale]?.trim()
  const nextAlt = { ...altDrafts.value }
  const nextCaption = { ...captionDrafts.value }
  const coverage = metadataCoverage(asset)

  for (const locale of coverage.missingAlt) {
    if (defaultAlt) nextAlt[locale] = defaultAlt
  }
  for (const locale of coverage.missingCaption) {
    if (defaultCaption) nextCaption[locale] = defaultCaption
  }

  altDrafts.value = nextAlt
  captionDrafts.value = nextCaption
  await saveMetadata()
}

defineExpose({
  uploadInput,
  uploading,
})
</script>

<template>
  <div
    class="ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col ginko:overflow-hidden"
    :class="embedded ? 'ginko:h-full' : ''"
  >
    <input
      ref="uploadInput"
      type="file"
      :multiple="mode === 'manage'"
      class="ginko:hidden"
      :accept="inputAccept"
      @change="handleUpload"
    />
    <div
      v-if="!embedded"
      class="ginko:flex ginko:min-h-12 ginko:shrink-0 ginko:items-center ginko:justify-between ginko:gap-3 ginko:border-b ginko:px-4 ginko:py-2"
    >
      <div class="ginko:min-w-0">
        <h3 class="ginko:truncate studio-text-title">{{ title ?? t('ginkoCms.studio.assetBrowser.title') }}</h3>
        <p v-if="isPickMode" class="ginko:truncate ginko:text-xs ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.assetBrowser.pickerHint') }}
        </p>
      </div>
      <Button size="sm" :disabled="uploading" @click="uploadInput?.click()">
        <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
        <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
        {{ t('ginkoCms.common.upload') }}
      </Button>
    </div>

    <StudioSplitPane
      storage-id="ginko-studio-assets-split"
      :nav-default-size="16"
      class="ginko:overflow-hidden"
    >
      <template #nav>
        <aside
          :aria-label="t('ginkoCms.studio.assetBrowser.navAriaLabel')"
          class="ginko:flex ginko:h-full ginko:min-h-0 ginko:flex-col"
        >
          <ScrollArea class="ginko:flex-1">
          <div class="ginko:py-3">
            <div class="ginko:mb-2">
              <div class="ginko:px-4 ginko:py-1">
                <span
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >
                  {{ t('ginkoCms.studio.assetBrowser.sectionLibrary') }}
                </span>
              </div>
              <nav class="ginko:space-y-px ginko:px-2">
                <button
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('full', 'all')
                      ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('full', 'all')"
                >
                  <Icon name="lucide:layers" class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ t('ginkoCms.studio.assetBrowser.allMedia') }}</span>
                  <span v-if="(sidebarFullViews[0]?.count ?? 0) > 0" class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{ sidebarFullViews[0]?.count }}</span>
                </button>
                <button
                  v-for="item in sidebarCollections"
                  :key="`coll:${item.key}`"
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('collections', item.key)
                      ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('collections', item.key)"
                >
                  <Icon
                    :name="item.icon"
                    class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
                  />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ item.label }}</span>
                  <span
                    v-if="item.count > 0"
                    class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                  >{{ item.count }}</span>
                </button>
              </nav>
            </div>

            <div v-if="sidebarTags.length > 0" class="ginko:mb-2">
              <div class="ginko:px-4 ginko:py-1">
                <span
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >
                  {{ t('ginkoCms.studio.assetBrowser.sectionTags') }}
                </span>
              </div>
              <nav class="ginko:space-y-px ginko:px-2">
                <button
                  v-for="tag in sidebarTags"
                  :key="`tag:${tag.key}`"
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('tags', tag.key)
                      ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('tags', tag.key)"
                >
                  <div
                    class="ginko:size-[10px] ginko:shrink-0 ginko:rounded-full"
                    :style="{ backgroundColor: tag.color }"
                  />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ tag.label }}</span>
                  <span
                    v-if="tag.count > 0"
                    class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                  >{{ tag.count }}</span>
                </button>
              </nav>
            </div>

            <div v-if="mode === 'manage'" class="ginko:mx-2 ginko:border-t ginko:pt-2">
              <button
                class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                :class="
                  isSidebarActive('trash', 'trash')
                    ? 'ginko:bg-accent ginko:font-medium ginko:text-accent-foreground'
                    : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                "
                @click="selectSidebar('trash', 'trash')"
              >
                <Trash2 class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
                <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ t('ginkoCms.studio.assetBrowser.trash') }}</span>
                <span
                  v-if="trashCount > 0"
                  class="ginko:text-xs ginko:tabular-nums ginko:opacity-50"
                >{{ trashCount }}</span>
              </button>
            </div>
          </div>
          </ScrollArea>
        </aside>
      </template>

      <div class="ginko:flex ginko:min-h-0 ginko:min-w-0 ginko:flex-1 ginko:flex-col">
        <div
          class="ginko:flex ginko:h-auto ginko:min-h-11 ginko:shrink-0 ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3 ginko:py-2"
        >
          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:md:hidden"
            :aria-label="t('ginkoCms.studio.assetBrowser.browseAriaLabel')"
            @click="mobileScopesOpen = true"
          >
            <Menu class="ginko:size-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0"
            :disabled="!canGoBack"
            @click="goBack"
          >
            <ChevronLeft class="ginko:size-4" />
          </Button>

          <div
            class="ginko:flex ginko:min-w-32 ginko:flex-1 ginko:items-center ginko:gap-1 ginko:text-sm"
          >
            <template v-for="(seg, i) in breadcrumb" :key="i">
              <ChevronRight
                v-if="i > 0"
                class="ginko:size-3 ginko:shrink-0 ginko:text-muted-foreground/50"
              />
              <button
                class="ginko:truncate ginko:transition-colors"
                :class="
                  i === breadcrumb.length - 1
                    ? 'ginko:font-semibold ginko:text-foreground'
                    : 'ginko:text-muted-foreground ginko:hover:text-foreground'
                "
                @click="navigateTo(seg.drillPath)"
              >
                {{ seg.label }}
              </button>
            </template>
          </div>

          <StudioSegmentedControl
            :model-value="viewMode"
            :items="viewSegments"
            :aria-label="t('ginkoCms.studio.assetBrowser.viewModeAriaLabel')"
            collapse-labels
            class="ginko:hidden ginko:sm:inline-flex"
            @update:model-value="viewMode = $event as 'list' | 'grid'"
          />

          <Select v-model="sortBy">
            <SelectTrigger
              size="sm"
              class="ginko:hidden ginko:text-xs ginko:sm:flex"
              :aria-label="t('ginkoCms.studio.assetBrowser.sortAriaLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{{ t('ginkoCms.studio.assetBrowser.sortName') }}</SelectItem>
              <SelectItem value="date">{{ t('ginkoCms.studio.assetBrowser.sortDate') }}</SelectItem>
              <SelectItem value="size">{{ t('ginkoCms.studio.assetBrowser.sortSize') }}</SelectItem>
              <SelectItem value="kind">{{ t('ginkoCms.studio.assetBrowser.sortKind') }}</SelectItem>
            </SelectContent>
          </Select>

          <Separator orientation="vertical" class="ginko:hidden ginko:h-5 ginko:lg:block" />

          <Button
            variant="ghost"
            size="sm"
            class="ginko:hidden ginko:h-7 ginko:gap-1.5 ginko:px-2 ginko:sm:inline-flex"
            :aria-expanded="showFilterRow"
            :aria-label="t('ginkoCms.studio.assetBrowser.toggleFiltersAriaLabel')"
            @click="filtersOpen = !filtersOpen"
          >
            <SlidersHorizontal class="ginko:size-3.5" />
            <Badge v-if="activeFilterCount > 0" variant="secondary" class="ginko:h-4 ginko:px-1 ginko:text-xs">{{ activeFilterCount }}</Badge>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:sm:hidden"
            :aria-label="t('ginkoCms.studio.assetBrowser.filterAssetsAriaLabel')"
            @click="mobileFiltersOpen = true"
          >
            <SlidersHorizontal class="ginko:size-4" />
          </Button>

          <div
            class="ginko:relative ginko:ml-auto ginko:min-w-0 ginko:flex-1 ginko:sm:w-56 ginko:sm:flex-none"
          >
            <Search
              class="ginko:pointer-events-none ginko:absolute ginko:left-2.5 ginko:top-1/2 ginko:size-3.5 ginko:-translate-y-1/2 ginko:text-muted-foreground/60"
            />
            <Input
              v-model="searchQuery"
              :placeholder="t('ginkoCms.studio.assetBrowser.searchPlaceholder')"
              class="ginko:h-8 ginko:w-full ginko:border-border/40 ginko:bg-card ginko:pl-8 ginko:text-sm ginko:shadow-none"
            />
          </div>

          <Button
            v-if="selectedAssetForDetails"
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:lg:hidden"
            :aria-label="t('ginkoCms.studio.assetBrowser.inspectSelectedAriaLabel')"
            @click="mobileDetailsOpen = true"
          >
            <PanelRight class="ginko:size-4" />
          </Button>

          <Button
            v-if="isPickMode && embedded"
            size="sm"
            class="ginko:h-7"
            :disabled="uploading"
            @click="uploadInput?.click()"
          >
            <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
            <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
            {{ t('ginkoCms.common.upload') }}
          </Button>
          <Select v-if="isPickMode && embedded" v-model="uploadDestination">
            <SelectTrigger
              size="sm"
              class="ginko:max-w-40 ginko:text-xs"
              :aria-label="t('ginkoCms.studio.assetBrowser.uploadDestinationAriaLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="destination in uploadDestinations"
                :key="destination.value"
                :value="destination.value"
                :disabled="destination.disabled"
              >
                {{ destination.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- On-demand filter row (design review S3); pinned open while a filter is active. -->
        <div
          v-if="showFilterRow"
          class="ginko:hidden ginko:shrink-0 ginko:flex-wrap ginko:items-center ginko:gap-1.5 ginko:border-b ginko:px-3 ginko:py-2 ginko:sm:flex"
        >
          <Select v-model="typeFilter">
            <SelectTrigger size="sm" class="ginko:text-xs" :aria-label="t('ginkoCms.studio.assetBrowser.filterTypeAriaLabel')">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{{ t('ginkoCms.studio.assetBrowser.typeAll') }}</SelectItem>
              <SelectItem value="image">{{ t('ginkoCms.studio.assetBrowser.typeImages') }}</SelectItem>
              <SelectItem value="document">{{ t('ginkoCms.studio.assetBrowser.typeDocuments') }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="timeFilter">
            <SelectTrigger
              size="sm"
              class="ginko:hidden ginko:text-xs ginko:lg:flex"
              :aria-label="t('ginkoCms.studio.assetBrowser.filterTimeAriaLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{{ t('ginkoCms.studio.assetBrowser.timeAny') }}</SelectItem>
              <SelectItem value="24h">{{ t('ginkoCms.studio.assetBrowser.time24h') }}</SelectItem>
              <SelectItem value="7d">{{ t('ginkoCms.studio.assetBrowser.time7d') }}</SelectItem>
              <SelectItem value="30d">{{ t('ginkoCms.studio.assetBrowser.time30d') }}</SelectItem>
              <SelectItem value="90d">{{ t('ginkoCms.studio.assetBrowser.time90d') }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="usageFilter">
            <SelectTrigger
              size="sm"
              class="ginko:hidden ginko:text-xs ginko:xl:flex"
              :aria-label="t('ginkoCms.studio.assetBrowser.filterUsageAriaLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{{ t('ginkoCms.studio.assetBrowser.usageAll') }}</SelectItem>
              <SelectItem value="used">{{ t('ginkoCms.studio.assetBrowser.usageUsed') }}</SelectItem>
              <SelectItem value="unused">{{ t('ginkoCms.studio.assetBrowser.usageUnused') }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="sizeFilter">
            <SelectTrigger
              size="sm"
              class="ginko:hidden ginko:text-xs ginko:xl:flex"
              :aria-label="t('ginkoCms.studio.assetBrowser.filterSizeAriaLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{{ t('ginkoCms.studio.assetBrowser.sizeAny') }}</SelectItem>
              <SelectItem value="small">{{ t('ginkoCms.studio.assetBrowser.sizeSmall') }}</SelectItem>
              <SelectItem value="medium">{{ t('ginkoCms.studio.assetBrowser.sizeMedium') }}</SelectItem>
              <SelectItem value="large">{{ t('ginkoCms.studio.assetBrowser.sizeLarge') }}</SelectItem>
            </SelectContent>
          </Select>
          <button
            v-if="activeFilterCount > 0"
            class="ginko:h-6 ginko:rounded-full ginko:px-2 ginko:text-xs ginko:text-muted-foreground ginko:transition-colors ginko:hover:bg-muted/60 ginko:hover:text-foreground"
            @click="clearFilters"
          >
            {{ t('ginkoCms.studio.assetBrowser.clear') }}
          </button>
        </div>

        <div
          v-if="mode === 'manage' && hasAssetSelection"
          class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2 ginko:border-b ginko:bg-muted/20 ginko:px-3 ginko:py-2"
        >
          <Badge variant="outline" class="ginko:text-xs"
            >{{ t('ginkoCms.studio.assetBrowser.selectedCount', { count: selectedVisibleAssetIds.length }) }}</Badge
          >
          <Input
            v-model="bulkTagInput"
            :placeholder="t('ginkoCms.studio.assetBrowser.tagSelectedPlaceholder')"
            class="ginko:h-8 ginko:max-w-48 ginko:text-xs"
            @keydown="handleBulkTagKeydown"
          />
          <Button
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="commitBulkTag('add')"
          >
            {{ t('ginkoCms.studio.assetBrowser.addTag') }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="commitBulkTag('remove')"
          >
            {{ t('ginkoCms.studio.assetBrowser.removeTag') }}
          </Button>
          <Button
            v-if="canBulkShareInCollection"
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="moveAssetsToCollection([...selectedVisibleAssetIds])"
          >
            {{ t('ginkoCms.studio.assetBrowser.makeAvailableCollection') }}
          </Button>
          <Button
            v-if="canBulkMakeGlobal"
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="moveAssetsToGlobal([...selectedVisibleAssetIds])"
          >
            {{ t('ginkoCms.studio.assetBrowser.makeAvailableEverywhere') }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
            :disabled="actionPending"
            @click="requestTrashSelectedAssets"
          >
            {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="ginko:ml-auto ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="clearAssetSelection"
          >
            {{ t('ginkoCms.studio.assetBrowser.clear') }}
          </Button>
        </div>

        <ScrollArea class="ginko:flex-1">
          <div v-if="error || localError" class="ginko:px-6 ginko:pt-4">
            <StudioNotice tone="danger" :description="localError || error" />
          </div>

          <div v-if="isLoading" class="ginko:grid ginko:grid-cols-1 ginko:gap-2 ginko:p-6">
            <Skeleton v-for="index in 12" :key="index" class="ginko:h-9" />
          </div>

          <StudioEmptyState
            v-else-if="currentItems.length === 0"
            class="ginko:m-6 ginko:border-0 ginko:bg-transparent"
            :title="t('ginkoCms.studio.assetBrowser.emptyTitle')"
            :description="activeFilterCount > 0 ? t('ginkoCms.studio.assetBrowser.emptyFilterHint') : undefined"
          >
            <template #icon>
              <FolderOpen class="ginko:size-5" aria-hidden="true" />
            </template>
            <template v-if="activeFilterCount === 0" #action>
              <Button size="sm" :disabled="uploading" @click="uploadInput?.click()">
                <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
                <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
                Upload
              </Button>
            </template>
          </StudioEmptyState>

          <table v-else-if="viewMode === 'list'" class="ginko:w-full ginko:text-xs">
            <thead class="ginko:sticky ginko:top-0 ginko:z-10 ginko:bg-card ginko:text-left">
              <tr class="ginko:border-b">
                <th class="ginko:w-10 ginko:py-2 ginko:pl-4 ginko:pr-2">
                  <input
                    v-if="mode === 'manage'"
                    type="checkbox"
                    class="ginko:size-4 ginko:rounded ginko:border-border ginko:align-middle"
                    :checked="allVisibleAssetsSelected"
                    :disabled="assetCount === 0"
                    @change="toggleAllVisibleAssets"
                  />
                </th>
                <th
                  class="ginko:w-[45%] ginko:px-4 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70"
                >
                  {{ t('ginkoCms.studio.assetBrowser.columnName') }}
                </th>
                <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
                  {{ t('ginkoCms.studio.assetBrowser.columnDateModified') }}
                </th>
                <th
                  class="ginko:px-3 ginko:py-2 ginko:text-right ginko:font-medium ginko:text-muted-foreground/70"
                >
                  {{ t('ginkoCms.studio.assetBrowser.columnSize') }}
                </th>
                <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
                  {{ t('ginkoCms.studio.assetBrowser.columnKind') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in currentItems"
                :key="itemKey(item)"
                class="ginko:cursor-pointer ginko:border-b ginko:border-border/30 ginko:transition-colors"
                :class="
                  item.type === 'asset' &&
                  (selectedAssetId === item.asset.id || isChosen(item.asset.id))
                    ? 'ginko:bg-primary/8'
                    : 'ginko:hover:bg-muted/40'
                "
                @click="handleItemClick(item)"
                @dblclick="handleItemDoubleClick(item)"
              >
                <td class="ginko:py-1.5 ginko:pl-4 ginko:pr-2" @click.stop>
                  <template v-if="item.type === 'asset'">
                    <input
                      v-if="mode === 'manage'"
                      type="checkbox"
                      class="ginko:size-4 ginko:rounded ginko:border-border ginko:align-middle"
                      :checked="selectedAssetIds.includes(item.asset.id)"
                      @change="toggleAssetSelection(item.asset.id)"
                    />
                    <button
                      v-else
                      class="ginko:inline-flex ginko:size-5 ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:text-xs"
                      :class="
                        isChosen(item.asset.id)
                          ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                          : 'ginko:border-border ginko:text-muted-foreground'
                      "
                      @click="togglePickerSelection(item.asset)"
                    >
                      <Check v-if="isChosen(item.asset.id)" class="ginko:size-3" />
                    </button>
                  </template>
                </td>
                <td class="ginko:px-4 ginko:py-1.5">
                  <div class="ginko:flex ginko:items-center ginko:gap-2.5">
                    <template v-if="item.type === 'folder'">
                      <Folder class="ginko:size-5 ginko:shrink-0 ginko:text-muted-foreground" />
                      <span class="ginko:truncate ginko:font-medium">{{ item.label }}</span>
                    </template>
                    <template v-else>
                      <div
                        class="ginko:flex ginko:size-10 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/50 ginko:bg-muted/60"
                      >
                        <img
                          v-if="canShowPreview(item.asset)"
                          :src="item.asset.thumbnailUrl ?? undefined"
                          alt=""
                          class="ginko:size-full ginko:object-cover"
                          @error="markPreviewFailed(item.asset)"
                        />
                        <Icon
                          v-else
                          :name="mimeIcon(item.asset.mimeType)"
                          class="ginko:size-4 ginko:text-muted-foreground"
                        />
                      </div>
                      <span class="ginko:min-w-0">
                        <span
                          class="ginko:block ginko:truncate"
                          :class="
                            item.asset.deletedAt ? 'ginko:line-through ginko:text-muted-foreground' : ''
                          "
                        >
                          {{ item.asset.filename }}
                        </span>
                        <span
                          class="ginko:block ginko:truncate ginko:text-xs ginko:text-muted-foreground/60"
                        >
                          {{ ownerPathLabel(item.asset) }}
                        </span>
                        <span
                          v-if="item.asset.mimeType.startsWith('image/')"
                          class="ginko:block ginko:truncate ginko:text-xs"
                          :class="
                            metadataCoverage(item.asset).complete
                              ? 'ginko:text-success-fg/80'
                              : 'ginko:text-warning-fg'
                          "
                        >
                          {{ metadataCoverageLabel(item.asset) }}
                        </span>
                      </span>
                    </template>
                  </div>
                </td>
                <td
                  class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:tabular-nums ginko:text-muted-foreground"
                >
                  <template v-if="item.type === 'asset'">{{
                    formatDate(item.asset.updatedAt ?? item.asset.createdAt)
                  }}</template>
                  <template v-else>{{
                    item.modifiedAt ? formatDate(item.modifiedAt) : '-'
                  }}</template>
                </td>
                <td
                  class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-right ginko:tabular-nums ginko:text-muted-foreground"
                >
                  <template v-if="item.type === 'folder'"
                    >{{ t(item.count === 1 ? 'ginkoCms.studio.assetBrowser.folderItemsOne' : 'ginkoCms.studio.assetBrowser.folderItemsOther', { count: item.count }) }}</template
                  >
                  <template v-else>{{ formatFileSize(item.asset.size) }}</template>
                </td>
                <td
                  class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-muted-foreground"
                >
                  {{ item.type === 'folder' ? t('ginkoCms.studio.assetBrowser.folderKind') : mimeKind(item.asset.mimeType) }}
                </td>
              </tr>
            </tbody>
          </table>

          <div
            v-else
            class="ginko:grid ginko:gap-x-4 ginko:gap-y-6 ginko:p-6"
            style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))"
          >
            <div
              v-for="item in currentItems"
              :key="itemKey(item)"
              class="ginko:group ginko:relative ginko:flex ginko:cursor-pointer ginko:flex-col ginko:items-center ginko:rounded-xl ginko:p-3 ginko:transition-colors"
              :class="
                item.type === 'asset' &&
                (selectedAssetId === item.asset.id || isChosen(item.asset.id))
                  ? 'ginko:bg-primary/8 ginko:ring-1 ginko:ring-primary/20'
                  : 'ginko:hover:bg-muted/50'
              "
              @click="handleItemClick(item)"
              @dblclick="handleItemDoubleClick(item)"
            >
              <button
                v-if="item.type === 'asset'"
                class="ginko:absolute ginko:left-2 ginko:top-2 ginko:z-10 ginko:inline-flex ginko:size-5 ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:bg-background/90 ginko:text-xs ginko:transition-colors"
                :class="
                  (
                    mode === 'manage'
                      ? selectedAssetIds.includes(item.asset.id)
                      : isChosen(item.asset.id)
                  )
                    ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                    : 'ginko:border-border ginko:text-muted-foreground'
                "
                @click.stop="
                  mode === 'manage'
                    ? toggleAssetSelection(item.asset.id)
                    : togglePickerSelection(item.asset)
                "
              >
                <Check
                  v-if="
                    mode === 'manage'
                      ? selectedAssetIds.includes(item.asset.id)
                      : isChosen(item.asset.id)
                  "
                  class="ginko:size-3"
                />
              </button>
              <template v-if="item.type === 'folder'">
                <div
                  class="ginko:mb-2 ginko:flex ginko:aspect-[4/3] ginko:w-full ginko:items-center ginko:justify-center"
                >
                  <Folder class="ginko:size-16 ginko:text-muted-foreground" />
                </div>
                <span
                  class="ginko:line-clamp-2 ginko:w-full ginko:text-center ginko:text-xs ginko:font-medium ginko:leading-tight"
                  >{{ item.label }}</span
                >
              </template>
              <template v-else>
                <div
                  class="ginko:mb-2 ginko:flex ginko:aspect-square ginko:w-full ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/50 ginko:bg-muted/40"
                >
                  <img
                    v-if="canShowPreview(item.asset)"
                    :src="item.asset.thumbnailUrl ?? undefined"
                    :alt="item.asset.filename"
                    class="ginko:h-full ginko:w-full ginko:object-cover"
                    @error="markPreviewFailed(item.asset)"
                  />
                  <Icon
                    v-else
                    :name="mimeIcon(item.asset.mimeType)"
                    class="ginko:size-10 ginko:text-muted-foreground/40"
                  />
                </div>
                <span
                  class="ginko:line-clamp-2 ginko:w-full ginko:text-center ginko:text-xs ginko:leading-tight"
                  :class="item.asset.deletedAt ? 'ginko:line-through ginko:text-muted-foreground' : ''"
                >
                  {{ item.asset.filename }}
                </span>
                <span class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground/60">{{
                  formatFileSize(item.asset.size)
                }}</span>
                <span
                  class="ginko:mt-0.5 ginko:line-clamp-1 ginko:w-full ginko:text-center ginko:text-xs ginko:text-muted-foreground/60"
                >
                  {{ ownerPathLabel(item.asset) }}
                </span>
              </template>
            </div>
            <div v-if="hasMoreAssets" class="ginko:flex ginko:justify-center ginko:py-4">
              <Button
                variant="outline"
                size="sm"
                :disabled="isLoadingMoreAssets"
                @click="loadMoreAssets"
              >
                {{ isLoadingMoreAssets ? t('ginkoCms.studio.assetBrowser.loadingMore') : t('ginkoCms.common.loadMore') }}
              </Button>
            </div>
          </div>
        </ScrollArea>

        <div
          class="ginko:shrink-0 ginko:border-t ginko:px-4 ginko:py-1.5 ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground/60"
        >
          {{ statusText }}
        </div>
      </div>

      <aside
        v-if="isPickMode"
        class="ginko:hidden ginko:w-[280px] ginko:shrink-0 ginko:border-l ginko:bg-background ginko:lg:block"
      >
        <ScrollArea class="ginko:h-full">
          <div class="ginko:space-y-4 ginko:p-4">
            <template v-if="selectedAssetForDetails">
              <div
                class="ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40"
              >
                <img
                  v-if="canShowPreview(selectedAssetForDetails)"
                  :src="selectedAssetForDetails.thumbnailUrl ?? undefined"
                  :alt="selectedAssetForDetails.filename"
                  class="ginko:max-h-52 ginko:w-full ginko:object-contain"
                  @error="markPreviewFailed(selectedAssetForDetails)"
                />
                <div v-else class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12">
                  <Icon
                    :name="mimeIcon(selectedAssetForDetails.mimeType)"
                    class="ginko:size-12 ginko:text-muted-foreground/40"
                  />
                </div>
              </div>
              <Button class="ginko:w-full" size="sm" @click="chooseAsset(selectedAssetForDetails)">
                {{ multiple && isChosen(selectedAssetForDetails.id) ? t('ginkoCms.common.remove') : t('ginkoCms.studio.assetBrowser.choose') }}
              </Button>
              <div class="ginko:space-y-2.5 ginko:text-xs">
                <div class="ginko:flex ginko:justify-between ginko:gap-3">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.filename') }}</span>
                  <span class="ginko:truncate ginko:font-mono">{{
                    selectedAssetForDetails.filename
                  }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.kind') }}</span>
                  <span>{{ mimeKind(selectedAssetForDetails.mimeType) }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.size') }}</span>
                  <span>{{ formatFileSize(selectedAssetForDetails.size) }}</span>
                </div>
                <div v-if="selectedAssetForDetails.width" class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.dimensions') }}</span>
                  <span
                    >{{ selectedAssetForDetails.width }} x
                    {{ selectedAssetForDetails.height }}</span
                  >
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownership') }}</span>
                  <Badge variant="outline" class="ginko:text-xs">{{
                    ownershipLabel(selectedAssetForDetails)
                  }}</Badge>
                </div>
                <div class="ginko:flex ginko:justify-between ginko:gap-3">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownerPath') }}</span>
                  <span class="ginko:truncate">{{ ownerPathLabel(selectedAssetForDetails) }}</span>
                </div>
                <div
                  v-if="selectedAssetForDetails.collectionLabel"
                  class="ginko:flex ginko:justify-between ginko:gap-3"
                >
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.collection') }}</span>
                  <span class="ginko:truncate">{{ selectedAssetForDetails.collectionLabel }}</span>
                </div>
                <div
                  v-if="selectedAssetForDetails.entryTitle"
                  class="ginko:flex ginko:justify-between ginko:gap-3"
                >
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.entry') }}</span>
                  <span class="ginko:truncate">{{ selectedAssetForDetails.entryTitle }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.usage') }}</span>
                  <span>{{ t(selectedAssetForDetails.usages.length === 1 ? 'ginkoCms.studio.assetBrowser.usagePlacesOne' : 'ginkoCms.studio.assetBrowser.usagePlacesOther', { count: selectedAssetForDetails.usages.length }) }}</span>
                </div>
              </div>
              <Separator />
              <div class="ginko:space-y-2">
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.language') }}</Label>
                  <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
                    <button
                      v-for="locale in localeOptions"
                      :key="locale.code"
                      type="button"
                      class="ginko:inline-flex ginko:h-7 ginko:items-center ginko:gap-1 ginko:rounded-md ginko:px-2 ginko:text-xs ginko:transition-colors"
                      :class="
                        activeLocale === locale.code
                          ? 'ginko:bg-accent ginko:font-medium ginko:text-foreground'
                          : 'ginko:text-muted-foreground ginko:hover:bg-muted/60 ginko:hover:text-foreground'
                      "
                      @click="activeLocale = locale.code"
                    >
                      <span class="ginko:font-mono ginko:uppercase">{{ locale.code }}</span>
                      <span
                        v-if="locale.label !== locale.code"
                        class="ginko:max-w-20 ginko:truncate"
                        >{{ locale.label }}</span
                      >
                    </button>
                  </div>
                </div>
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.altText') }}</Label>
                  <Input v-model="altText" class="ginko:h-8 ginko:text-xs" />
                </div>
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.caption') }}</Label>
                  <Input v-model="captionText" class="ginko:h-8 ginko:text-xs" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  class="ginko:w-full"
                  :disabled="savingMeta"
                  @click="saveMetadata"
                >
                  {{ t('ginkoCms.studio.assetBrowser.saveDetails') }}
                </Button>
              </div>
            </template>
            <div v-else class="ginko:text-sm ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.assetBrowser.inspectEmpty') }}
            </div>
          </div>
        </ScrollArea>
      </aside>

      <StudioAssetMobileScopes
        v-model:open="mobileScopesOpen"
        :mode="mode"
        :collections="sidebarCollections"
        :tags="sidebarTags"
        :full-views="sidebarFullViews"
        :trash-count="trashCount"
        :is-active="isSidebarActive"
        @select="selectMobileSidebar"
      />

      <StudioAssetMobileFilters
        v-model:open="mobileFiltersOpen"
        v-model:view-mode="viewMode"
        v-model:sort-by="sortBy"
        v-model:type-filter="typeFilter"
        v-model:time-filter="timeFilter"
        @clear="clearFilters"
      />
      <Sheet v-model:open="mobileDetailsOpen">
        <SheetContent
          side="bottom"
          class="ginko:max-h-[88dvh] ginko:rounded-t-xl ginko:p-0 ginko:lg:hidden"
        >
          <template v-if="selectedAssetForDetails">
            <SheetHeader class="ginko:border-b ginko:pr-12">
              <SheetTitle class="ginko:truncate ginko:text-sm">{{
                selectedAssetForDetails.filename
              }}</SheetTitle>
              <SheetDescription>{{ ownershipLabel(selectedAssetForDetails) }}</SheetDescription>
            </SheetHeader>
            <ScrollArea class="ginko:flex-1">
              <div class="ginko:space-y-4 ginko:p-4 ginko:pb-24">
                <div
                  class="ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40"
                >
                  <img
                    v-if="canShowPreview(selectedAssetForDetails)"
                    :src="selectedAssetForDetails.thumbnailUrl ?? undefined"
                    :alt="selectedAssetForDetails.filename"
                    class="ginko:max-h-64 ginko:w-full ginko:object-contain"
                    @error="markPreviewFailed(selectedAssetForDetails)"
                  />
                  <div
                    v-else
                    class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12"
                  >
                    <Icon
                      :name="mimeIcon(selectedAssetForDetails.mimeType)"
                      class="ginko:size-12 ginko:text-muted-foreground/40"
                    />
                  </div>
                </div>

                <div class="ginko:space-y-2.5 ginko:text-xs">
                  <div class="ginko:flex ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.filename') }}</span>
                    <span class="ginko:truncate ginko:font-mono">{{
                      selectedAssetForDetails.filename
                    }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.kind') }}</span>
                    <span>{{ mimeKind(selectedAssetForDetails.mimeType) }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.size') }}</span>
                    <span>{{ formatFileSize(selectedAssetForDetails.size) }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.width"
                    class="ginko:flex ginko:justify-between"
                  >
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.dimensions') }}</span>
                    <span
                      >{{ selectedAssetForDetails.width }} x
                      {{ selectedAssetForDetails.height }}</span
                    >
                  </div>
                  <div class="ginko:flex ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownership') }}</span>
                    <Badge variant="outline" class="ginko:text-xs">{{
                      ownershipLabel(selectedAssetForDetails)
                    }}</Badge>
                  </div>
                  <div class="ginko:flex ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownerPath') }}</span>
                    <span class="ginko:truncate">{{
                      ownerPathLabel(selectedAssetForDetails)
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.collectionLabel"
                    class="ginko:flex ginko:justify-between ginko:gap-3"
                  >
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.collection') }}</span>
                    <span class="ginko:truncate">{{
                      selectedAssetForDetails.collectionLabel
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.entryTitle"
                    class="ginko:flex ginko:justify-between ginko:gap-3"
                  >
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.entry') }}</span>
                    <span class="ginko:truncate">{{ selectedAssetForDetails.entryTitle }}</span>
                  </div>
                </div>

                <Separator />

                <div class="ginko:space-y-2">
                  <div
                    class="ginko:rounded-md ginko:border ginko:px-2.5 ginko:py-2 ginko:text-xs"
                    :class="
                      metadataCoverage(selectedAssetForDetails).complete
                        ? 'ginko:border-success/30 ginko:bg-success/10 ginko:dark:bg-success/15 ginko:text-success-fg'
                        : 'ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
                    "
                  >
                    {{ metadataCoverageLabel(selectedAssetForDetails) }}
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.language') }}</Label>
                    <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
                      <button
                        v-for="locale in localeOptions"
                        :key="`mobile-locale:${locale.code}`"
                        type="button"
                        class="ginko:inline-flex ginko:h-7 ginko:items-center ginko:gap-1 ginko:rounded-md ginko:px-2 ginko:text-xs ginko:transition-colors"
                        :class="
                          activeLocale === locale.code
                            ? 'ginko:bg-accent ginko:font-medium ginko:text-foreground'
                            : 'ginko:text-muted-foreground ginko:hover:bg-muted/60 ginko:hover:text-foreground'
                        "
                        @click="activeLocale = locale.code"
                      >
                        <span class="ginko:font-mono ginko:uppercase">{{ locale.code }}</span>
                        <span
                          v-if="locale.label !== locale.code"
                          class="ginko:max-w-24 ginko:truncate"
                          >{{ locale.label }}</span
                        >
                      </button>
                    </div>
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.altText') }}</Label>
                    <Input
                      v-model="altText"
                      class="ginko:h-9 ginko:text-sm"
                      :disabled="savingMeta"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.caption') }}</Label>
                    <Input
                      v-model="captionText"
                      class="ginko:h-9 ginko:text-sm"
                      :disabled="savingMeta"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="saveMetadata"
                  >
                    <Loader2
                      v-if="savingMeta"
                      class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
                    />
                    {{ t('ginkoCms.studio.assetBrowser.saveDetails') }}
                  </Button>
                  <Button
                    v-if="canCopyDefaultMetadata"
                    size="sm"
                    variant="ghost"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="copyDefaultMetadataToMissingLocales"
                  >
                    {{ t('ginkoCms.studio.assetBrowser.copyDefaultDetails') }}
                  </Button>
                </div>

                <template v-if="mode === 'manage'">
                  <Separator />
                  <div class="ginko:space-y-2">
                    <h4
                      class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                    >
                      {{ t('ginkoCms.studio.assetBrowser.tags') }}
                    </h4>
                    <div
                      v-if="selectedAssetTags.length > 0"
                      class="ginko:flex ginko:flex-wrap ginko:gap-1.5"
                    >
                      <button
                        v-for="tag in selectedAssetTags"
                        :key="`mobile-detail-tag:${tag}`"
                        class="ginko:inline-flex ginko:items-center ginko:gap-1 ginko:rounded-full ginko:bg-muted/60 ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:transition-colors ginko:hover:bg-muted"
                        :disabled="actionPending"
                        @click="removeTagFromSelectedAsset(tag)"
                      >
                        <span>{{
                          sidebarTags.find((sidebarTag) => sidebarTag.key === tag)?.label ?? tag
                        }}</span>
                        <X class="ginko:size-3" />
                      </button>
                    </div>
                    <Input
                      v-model="selectedTagInput"
                      :placeholder="t('ginkoCms.studio.assetBrowser.addTagPlaceholder')"
                      class="ginko:h-8 ginko:text-xs"
                      :disabled="actionPending"
                      @keydown="handleSelectedTagKeydown"
                    />
                  </div>

                  <Separator />
                  <div class="ginko:space-y-1.5">
                    <template v-if="selectedAssetForDetails.deletedAt">
                      <Button
                        variant="outline"
                        size="sm"
                        class="ginko:w-full ginko:justify-start ginko:text-xs"
                        :disabled="actionPending"
                        @click="restoreSelectedAsset"
                      >
                        <Undo2 class="ginko:mr-2 ginko:size-3.5" />
                        {{ t('ginkoCms.studio.assetBrowser.restore') }}
                      </Button>
                    </template>
                    <template v-else>
                      <Button
                        v-if="
                          selectedAssetForDetails.scope === 'entry' &&
                          selectedAssetForDetails.collectionId
                        "
                        variant="outline"
                        size="sm"
                        class="ginko:w-full ginko:justify-start ginko:text-xs"
                        :disabled="actionPending"
                        @click="moveSelectedAssetToCollection"
                      >
                        <ArrowUp class="ginko:mr-2 ginko:size-3.5" />
                        {{ t('ginkoCms.studio.assetBrowser.makeAvailableCollection') }}
                      </Button>
                      <Button
                        v-if="selectedAssetForDetails.scope !== 'global'"
                        variant="outline"
                        size="sm"
                        class="ginko:w-full ginko:justify-start ginko:text-xs"
                        :disabled="actionPending"
                        @click="moveSelectedAssetToGlobal"
                      >
                        <Globe class="ginko:mr-2 ginko:size-3.5" />
                        {{ t('ginkoCms.studio.assetBrowser.makeAvailableEverywhere') }}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="ginko:w-full ginko:justify-start ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
                        :disabled="actionPending"
                        @click="requestTrashAsset(selectedAssetForDetails)"
                      >
                        <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                        {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
                      </Button>
                    </template>
                  </div>
                </template>
              </div>
            </ScrollArea>
            <div
              v-if="isPickMode"
              class="ginko:absolute ginko:inset-x-0 ginko:bottom-0 ginko:border-t ginko:bg-background ginko:p-4"
            >
              <Button class="ginko:w-full" @click="chooseAsset(selectedAssetForDetails)">
                {{ multiple && isChosen(selectedAssetForDetails.id) ? t('ginkoCms.common.remove') : t('ginkoCms.studio.assetBrowser.choose') }}
              </Button>
            </div>
          </template>
        </SheetContent>
      </Sheet>

      <Sheet v-model:open="drawerOpen">
        <SheetContent side="right" class="ginko:p-0">
          <template v-if="selectedAsset">
            <SheetHeader class="ginko:border-b ginko:pr-12">
              <SheetTitle class="ginko:truncate ginko:text-sm">{{
                selectedAsset.filename
              }}</SheetTitle>
              <SheetDescription>{{ ownershipLabel(selectedAsset) }}</SheetDescription>
            </SheetHeader>

            <ScrollArea class="ginko:flex-1">
              <div class="ginko:space-y-5 ginko:p-5">
                <div
                  class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/50 ginko:bg-muted/40"
                >
                  <img
                    v-if="canShowPreview(selectedAsset)"
                    :src="selectedAsset.thumbnailUrl ?? undefined"
                    :alt="selectedAsset.filename"
                    class="ginko:max-h-56 ginko:w-full ginko:object-contain"
                    @error="markPreviewFailed(selectedAsset)"
                  />
                  <div
                    v-else
                    class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12"
                  >
                    <Icon
                      :name="mimeIcon(selectedAsset.mimeType)"
                      class="ginko:size-16 ginko:text-muted-foreground/40"
                    />
                  </div>
                </div>

                <div class="ginko:space-y-2">
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-2">
                    <h4
                      class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                    >
                      {{ t('ginkoCms.studio.assetBrowser.tags') }}
                    </h4>
                    <span class="ginko:text-xs ginko:text-muted-foreground/50">
                      {{ t(selectedAssetTags.length === 1 ? 'ginkoCms.studio.assetBrowser.tagsCountOne' : 'ginkoCms.studio.assetBrowser.tagsCountOther', { count: selectedAssetTags.length }) }}
                    </span>
                  </div>
                  <div
                    v-if="selectedAssetTags.length > 0"
                    class="ginko:flex ginko:flex-wrap ginko:gap-1.5"
                  >
                    <button
                      v-for="tag in selectedAssetTags"
                      :key="tag"
                      class="ginko:inline-flex ginko:items-center ginko:gap-1 ginko:rounded-full ginko:bg-muted/60 ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:transition-colors ginko:hover:bg-muted"
                      :disabled="actionPending"
                      @click="removeTagFromSelectedAsset(tag)"
                    >
                      <div
                        class="ginko:size-[6px] ginko:rounded-full"
                        :style="{
                          backgroundColor:
                            sidebarTags.find((sidebarTag) => sidebarTag.key === tag)?.color ??
                            'oklch(0 0 0 / 18%)',
                        }"
                      />
                      <span>{{
                        sidebarTags.find((sidebarTag) => sidebarTag.key === tag)?.label ?? tag
                      }}</span>
                      <X class="ginko:size-3" />
                    </button>
                  </div>
                  <Input
                    v-model="selectedTagInput"
                    :placeholder="t('ginkoCms.studio.assetBrowser.addTagPlaceholder')"
                    class="ginko:h-8 ginko:text-xs"
                    :disabled="actionPending"
                    @keydown="handleSelectedTagKeydown"
                  />
                </div>

                <div class="ginko:space-y-2.5 ginko:text-xs">
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.filename') }}</span
                    ><span class="ginko:ml-2 ginko:max-w-[200px] ginko:truncate ginko:font-mono">{{
                      selectedAsset.filename
                    }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.kind') }}</span
                    ><span>{{ mimeKind(selectedAsset.mimeType) }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.size') }}</span
                    ><span>{{ formatFileSize(selectedAsset.size) }}</span>
                  </div>
                  <div v-if="selectedAsset.width" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.dimensions') }}</span
                    ><span>{{ selectedAsset.width }} x {{ selectedAsset.height }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.created') }}</span
                    ><span>{{ formatDate(selectedAsset.createdAt) }}</span>
                  </div>
                  <div v-if="selectedAsset.updatedAt" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.modified') }}</span
                    ><span>{{ formatDate(selectedAsset.updatedAt) }}</span>
                  </div>
                </div>

                <Separator />

                <div class="ginko:space-y-2">
                  <h4
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                  >
                    {{ t('ginkoCms.studio.assetBrowser.details') }}
                  </h4>
                  <div
                    class="ginko:rounded-md ginko:border ginko:px-2.5 ginko:py-2 ginko:text-xs"
                    :class="
                      metadataCoverage(selectedAsset).complete
                        ? 'ginko:border-success/30 ginko:bg-success/10 ginko:dark:bg-success/15 ginko:text-success-fg'
                        : 'ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
                    "
                  >
                    {{ metadataCoverageLabel(selectedAsset) }}
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.language') }}</Label>
                    <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
                      <button
                        v-for="locale in localeOptions"
                        :key="locale.code"
                        type="button"
                        class="ginko:inline-flex ginko:h-7 ginko:items-center ginko:gap-1 ginko:rounded-md ginko:px-2 ginko:text-xs ginko:transition-colors"
                        :class="
                          activeLocale === locale.code
                            ? 'ginko:bg-accent ginko:font-medium ginko:text-foreground'
                            : 'ginko:text-muted-foreground ginko:hover:bg-muted/60 ginko:hover:text-foreground'
                        "
                        @click="activeLocale = locale.code"
                      >
                        <span class="ginko:font-mono ginko:uppercase">{{ locale.code }}</span>
                        <span
                          v-if="locale.label !== locale.code"
                          class="ginko:max-w-24 ginko:truncate"
                          >{{ locale.label }}</span
                        >
                        <span
                          v-if="locale.isDefault"
                          class="ginko:text-xs ginko:text-muted-foreground"
                        >
                          {{ t('ginkoCms.studio.assetBrowser.localeDefault') }}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.altText') }}</Label>
                    <Input
                      v-model="altText"
                      class="ginko:h-8 ginko:text-xs"
                      :disabled="savingMeta"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">{{ t('ginkoCms.studio.assetBrowser.caption') }}</Label>
                    <Input
                      v-model="captionText"
                      class="ginko:h-8 ginko:text-xs"
                      :disabled="savingMeta"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="saveMetadata"
                  >
                    <Loader2
                      v-if="savingMeta"
                      class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
                    />
                    {{ t('ginkoCms.studio.assetBrowser.saveDetails') }}
                  </Button>
                  <Button
                    v-if="canCopyDefaultMetadata"
                    size="sm"
                    variant="ghost"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="copyDefaultMetadataToMissingLocales"
                  >
                    {{ t('ginkoCms.studio.assetBrowser.copyDefaultDetails') }}
                  </Button>
                </div>

                <Separator />

                <div class="ginko:space-y-2.5 ginko:text-xs">
                  <h4
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                  >
                    {{ t('ginkoCms.studio.assetBrowser.location') }}
                  </h4>
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownership') }}</span
                    ><Badge variant="outline" class="ginko:text-xs">{{
                      ownershipLabel(selectedAsset)
                    }}</Badge>
                  </div>
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.ownerPath') }}</span
                    ><span class="ginko:ml-2 ginko:max-w-[220px] ginko:truncate">{{
                      ownerPathLabel(selectedAsset)
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAsset.collectionLabel"
                    class="ginko:flex ginko:justify-between"
                  >
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.collection') }}</span
                    ><span>{{ selectedAsset.collectionLabel }}</span>
                  </div>
                  <div v-if="selectedAsset.entryTitle" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">{{ t('ginkoCms.studio.assetBrowser.entry') }}</span
                    ><span class="ginko:ml-2 ginko:max-w-[200px] ginko:truncate">{{
                      selectedAsset.entryTitle
                    }}</span>
                  </div>
                </div>

                <Separator />

                <div class="ginko:space-y-2">
                  <h4
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                  >
                    {{ t('ginkoCms.studio.assetBrowser.usage') }}
                  </h4>
                  <div
                    v-if="selectedAsset.usages.length === 0"
                    class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-warning-fg"
                  >
                    <AlertTriangle class="ginko:size-3.5" />
                    {{ t('ginkoCms.studio.assetBrowser.notUsedAnywhere') }}
                  </div>
                  <template v-else>
                    <p class="ginko:text-xs ginko:text-muted-foreground/60">
                      {{ t(selectedAsset.usages.length === 1 ? 'ginkoCms.studio.assetBrowser.usedInOne' : 'ginkoCms.studio.assetBrowser.usedInOther', { count: selectedAsset.usages.length }) }}
                    </p>
                    <div
                      v-for="(usage, i) in selectedAsset.usages.slice(0, 5)"
                      :key="`${usage.entryId}:${usage.fieldPath}:${i}`"
                      class="ginko:flex ginko:items-start ginko:gap-2 ginko:border-b ginko:border-border/30 ginko:py-1.5 ginko:text-xs ginko:last:border-0"
                    >
                      <Link
                        class="ginko:mt-0.5 ginko:size-3 ginko:shrink-0 ginko:text-muted-foreground/50"
                      />
                      <div class="ginko:min-w-0">
                        <div class="ginko:truncate ginko:font-medium">{{ usage.entryTitle }}</div>
                        <div class="ginko:font-mono ginko:text-xs ginko:text-muted-foreground/50">
                          {{ usage.fieldPath }}
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <Separator />

                <div class="ginko:space-y-1.5">
                  <template v-if="selectedAsset.deletedAt">
                    <Button
                      variant="outline"
                      size="sm"
                      class="ginko:w-full ginko:justify-start ginko:text-xs"
                      :disabled="actionPending"
                      @click="restoreSelectedAsset"
                    >
                      <Undo2 class="ginko:mr-2 ginko:size-3.5" />
                      {{ t('ginkoCms.studio.assetBrowser.restore') }}
                    </Button>
                  </template>
                  <template v-else>
                    <Button
                      v-if="selectedAsset.scope === 'entry' && selectedAsset.collectionId"
                      variant="outline"
                      size="sm"
                      class="ginko:w-full ginko:justify-start ginko:text-xs"
                      :disabled="actionPending"
                      @click="moveSelectedAssetToCollection"
                    >
                      <ArrowUp class="ginko:mr-2 ginko:size-3.5" />
                      {{ t('ginkoCms.studio.assetBrowser.makeAvailableCollection') }}
                    </Button>
                    <Button
                      v-if="selectedAsset.scope !== 'global'"
                      variant="outline"
                      size="sm"
                      class="ginko:w-full ginko:justify-start ginko:text-xs"
                      :disabled="actionPending"
                      @click="moveSelectedAssetToGlobal"
                    >
                      <Globe class="ginko:mr-2 ginko:size-3.5" />
                      {{ t('ginkoCms.studio.assetBrowser.makeAvailableEverywhere') }}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="ginko:w-full ginko:justify-start ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
                      :disabled="actionPending"
                      @click="requestTrashAsset(selectedAsset)"
                    >
                      <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                      {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
                    </Button>
                  </template>
                </div>
              </div>
            </ScrollArea>
          </template>
        </SheetContent>
      </Sheet>
    </StudioSplitPane>
  </div>

  <StudioConfirmDialog
    :open="!!pendingDestructiveAssetAction"
    :title="pendingDestructiveActionTitle"
    :description="pendingDestructiveActionDescription"
    :confirm-label="pendingDestructiveConfirmLabel"
    @update:open="handleDestructiveDialogOpen"
    @confirm="confirmDestructiveAssetAction"
  >
    <div class="ginko:space-y-3 ginko:text-sm ginko:text-muted-foreground">
      <StudioNotice
        :tone="pendingDestructiveUsageCount > 0 ? 'warning' : 'neutral'"
        :title="
          pendingDestructiveUsageCount > 0
            ? t(pendingDestructiveUsageCount === 1 ? 'ginkoCms.studio.assetBrowser.usageAffectedOne' : 'ginkoCms.studio.assetBrowser.usageAffectedOther', { count: pendingDestructiveUsageCount })
            : t('ginkoCms.studio.assetBrowser.noUsageFound')
        "
        :description="
          pendingDestructiveUsageCount > 0
            ? t('ginkoCms.studio.assetBrowser.reviewAffected')
            : t('ginkoCms.studio.assetBrowser.noEntriesReference')
        "
      />
      <div class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3">
        <div
          class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.assetBrowser.affectedAssets') }}
        </div>
        <div class="ginko:space-y-2">
          <div
            v-for="asset in pendingDestructiveAffectedAssets.slice(0, 6)"
            :key="asset.id"
            class="ginko:flex ginko:min-w-0 ginko:items-center ginko:justify-between ginko:gap-3 ginko:text-xs"
          >
            <span class="ginko:truncate ginko:font-medium ginko:text-foreground">{{
              asset.filename
            }}</span>
            <span class="ginko:shrink-0 ginko:text-muted-foreground">
              {{ t(asset.usages.length === 1 ? 'ginkoCms.studio.assetBrowser.assetUsageOne' : 'ginkoCms.studio.assetBrowser.assetUsageOther', { count: asset.usages.length }) }}
            </span>
          </div>
          <div
            v-if="pendingDestructiveAffectedAssets.length > 6"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            {{ t('ginkoCms.studio.assetBrowser.moreAffected', { count: pendingDestructiveAffectedAssets.length - 6 }) }}
          </div>
        </div>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
