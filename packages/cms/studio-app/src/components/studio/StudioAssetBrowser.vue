<script setup lang="ts">
import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
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
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import type { StudioAssetContext, StudioAssetRecord } from '../../composables/internal/types'
import {
  finderAssetToStudioAsset,
  mimeKind,
  type FinderAssetRecord,
  type FinderItem,
  type SidebarMode,
  type StudioAssetBrowserMode,
  useStudioAssetFinder,
} from '../../composables/internal/useStudioAssetFinder'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useConvexMutation } from '../../composables/useStudioConvex'
import Sheet from '../ui/sheet/Sheet.vue'
import SheetContent from '../ui/sheet/SheetContent.vue'
import SheetDescription from '../ui/sheet/SheetDescription.vue'
import SheetHeader from '../ui/sheet/SheetHeader.vue'
import SheetTitle from '../ui/sheet/SheetTitle.vue'

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
  asset.ownerPath?.length ? asset.ownerPath.join(' / ') : 'Global'

const ownershipLabel = (asset: Pick<FinderAssetRecord, 'scope' | 'collectionLabel'>) => {
  if (asset.scope === 'global') return 'Shared library asset'
  if (asset.scope === 'collection') return `Shared in ${asset.collectionLabel ?? 'collection'}`
  return 'Owned by this entry'
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
  if (coverage.complete) return 'Details complete'
  const missing = new Set([...coverage.missingAlt, ...coverage.missingCaption])
  return `Missing details: ${Array.from(missing).join(', ').toUpperCase()}`
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
      ? 'This entry'
      : props.assetContext?.collectionSlug || props.assetContext?.collectionId
        ? 'This collection'
        : 'Global',
    disabled: false,
  },
  {
    value: 'collection',
    label: props.assetContext?.collectionSlug
      ? `${props.assetContext.collectionSlug} collection`
      : 'Collection',
    disabled: !props.assetContext?.collectionSlug && !props.assetContext?.collectionId,
  },
  {
    value: 'global',
    label: 'Shared library',
    disabled: false,
  },
])

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
const { t } = useCmsI18n()
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

const pendingDestructiveActionTitle = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return ''
  if (action.kind === 'bulk-trash') return 'Move selected assets to trash?'
  return 'Move asset to trash?'
})

const pendingDestructiveActionDescription = computed(() => {
  const action = pendingDestructiveAssetAction.value
  if (!action) return ''
  return 'Assets in trash no longer appear in picker results, but can still be restored.'
})

const pendingDestructiveConfirmLabel = computed(() => {
  return 'Move to trash'
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
    parts.push(`${folderCount.value} folder${folderCount.value === 1 ? '' : 's'}`)
  if (assetCount.value > 0)
    parts.push(`${assetCount.value} file${assetCount.value === 1 ? '' : 's'}`)
  return parts.join(', ') || 'Empty'
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

function mimeTypeMatches(pattern: string, mimeType: string): boolean {
  if (pattern.endsWith('/*')) return mimeType.startsWith(pattern.slice(0, -1))
  return pattern === mimeType
}

function parseAspectRatio(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?::|\/)(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return width / height
}

function assertAssetAllowed(asset: Pick<FinderAssetRecord, 'mimeType' | 'width' | 'height'>) {
  if (
    acceptedTypes.value.length > 0 &&
    !acceptedTypes.value.some((acceptedType) => mimeTypeMatches(acceptedType, asset.mimeType))
  ) {
    throw new Error(`File type "${asset.mimeType || 'unknown'}" is not allowed.`)
  }

  const expectedRatio = parseAspectRatio(props.aspectRatio)
  if (!expectedRatio || !asset.width || !asset.height) return

  const actualRatio = asset.width / asset.height
  const tolerance = 0.01
  if (Math.abs(actualRatio - expectedRatio) / expectedRatio > tolerance) {
    throw new Error(`Image must use a ${props.aspectRatio} aspect ratio.`)
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
    :class="embedded ? 'h-full' : ''"
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
        <h3 class="ginko:truncate studio-text-title">{{ title ?? 'Media' }}</h3>
        <p v-if="isPickMode" class="ginko:truncate ginko:text-xs ginko:text-muted-foreground">
          Choose or upload an asset without leaving this entry.
        </p>
      </div>
      <Button size="sm" :disabled="uploading" @click="uploadInput?.click()">
        <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
        <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
        Upload
      </Button>
    </div>

    <div class="ginko:flex ginko:min-h-0 ginko:flex-1 ginko:overflow-hidden">
      <aside
        class="ginko:hidden ginko:w-[200px] ginko:shrink-0 ginko:border-r ginko:bg-muted/20 ginko:md:flex ginko:md:flex-col"
      >
        <ScrollArea class="ginko:flex-1">
          <div class="ginko:py-3">
            <div class="ginko:mb-2">
              <div class="ginko:px-4 ginko:py-1">
                <span
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >
                  Collections
                </span>
              </div>
              <nav class="ginko:space-y-px ginko:px-2">
                <button
                  v-for="item in sidebarCollections"
                  :key="`coll:${item.key}`"
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('collections', item.key)
                      ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('collections', item.key)"
                >
                  <Icon
                    :name="item.icon"
                    class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
                  />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ item.label }}</span>
                  <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                    item.count
                  }}</span>
                </button>
              </nav>
            </div>

            <div v-if="sidebarTags.length > 0" class="ginko:mb-2">
              <div class="ginko:px-4 ginko:py-1">
                <span
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >
                  Tags
                </span>
              </div>
              <nav class="ginko:space-y-px ginko:px-2">
                <button
                  v-for="tag in sidebarTags"
                  :key="`tag:${tag.key}`"
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('tags', tag.key)
                      ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('tags', tag.key)"
                >
                  <div
                    class="ginko:size-[10px] ginko:shrink-0 ginko:rounded-full"
                    :style="{ backgroundColor: tag.color }"
                  />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ tag.label }}</span>
                  <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                    tag.count
                  }}</span>
                </button>
              </nav>
            </div>

            <div class="ginko:mb-2">
              <div class="ginko:px-4 ginko:py-1">
                <span
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                >
                  Library views
                </span>
              </div>
              <nav class="ginko:space-y-px ginko:px-2">
                <button
                  v-for="item in sidebarFullViews"
                  :key="`full:${item.key}`"
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('full', item.key)
                      ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectSidebar('full', item.key)"
                >
                  <Icon
                    :name="item.icon"
                    class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
                  />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ item.label }}</span>
                  <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                    item.count
                  }}</span>
                </button>
              </nav>
            </div>

            <div v-if="mode === 'manage'" class="ginko:mx-2 ginko:border-t ginko:pt-2">
              <button
                class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-[5px] ginko:text-sm ginko:transition-colors"
                :class="
                  isSidebarActive('trash', 'trash')
                    ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                    : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                "
                @click="selectSidebar('trash', 'trash')"
              >
                <Trash2 class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
                <span class="ginko:flex-1 ginko:truncate ginko:text-left">Trash</span>
                <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                  trashCount
                }}</span>
              </button>
            </div>
          </div>
        </ScrollArea>
      </aside>

      <div class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:flex-col">
        <div
          class="ginko:flex ginko:h-auto ginko:min-h-11 ginko:shrink-0 ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3 ginko:py-2"
        >
          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:md:hidden"
            aria-label="Browse asset library"
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

          <div
            class="ginko:hidden ginko:items-center ginko:rounded-lg ginko:bg-muted/60 ginko:p-0.5 ginko:sm:inline-flex"
          >
            <button
              class="ginko:inline-flex ginko:h-6 ginko:w-6 ginko:items-center ginko:justify-center ginko:rounded-md ginko:transition-[color,background-color] ginko:duration-150 ginko:ease-out"
              :class="
                viewMode === 'list'
                  ? 'ginko:bg-background'
                  : 'ginko:text-muted-foreground ginko:hover:text-foreground'
              "
              @click="viewMode = 'list'"
            >
              <List class="ginko:size-3.5" />
            </button>
            <button
              class="ginko:inline-flex ginko:h-6 ginko:w-6 ginko:items-center ginko:justify-center ginko:rounded-md ginko:transition-[color,background-color] ginko:duration-150 ginko:ease-out"
              :class="
                viewMode === 'grid'
                  ? 'ginko:bg-background'
                  : 'ginko:text-muted-foreground ginko:hover:text-foreground'
              "
              @click="viewMode = 'grid'"
            >
              <Grid3x3 class="ginko:size-3.5" />
            </button>
          </div>

          <select
            v-model="sortBy"
            class="ginko:hidden ginko:h-7 ginko:rounded-md ginko:border-0 ginko:bg-muted/60 ginko:px-2 ginko:text-xs ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring ginko:sm:block"
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
            <option value="kind">Kind</option>
          </select>

          <Separator orientation="vertical" class="ginko:hidden ginko:h-5 ginko:lg:block" />

          <div class="ginko:hidden ginko:items-center ginko:gap-1.5 ginko:sm:flex">
            <select
              v-model="typeFilter"
              class="ginko:h-6 ginko:rounded-full ginko:border-0 ginko:bg-muted/60 ginko:pl-2 ginko:pr-5 ginko:text-xs ginko:text-muted-foreground ginko:outline-none ginko:transition-colors ginko:hover:text-foreground"
            >
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="document">Documents</option>
            </select>
            <select
              v-model="timeFilter"
              class="ginko:hidden ginko:h-6 ginko:rounded-full ginko:border-0 ginko:bg-muted/60 ginko:pl-2 ginko:pr-5 ginko:text-xs ginko:text-muted-foreground ginko:outline-none ginko:transition-colors ginko:hover:text-foreground ginko:lg:block"
            >
              <option value="any">Any time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <select
              v-model="usageFilter"
              class="ginko:hidden ginko:h-6 ginko:rounded-full ginko:border-0 ginko:bg-muted/60 ginko:pl-2 ginko:pr-5 ginko:text-xs ginko:text-muted-foreground ginko:outline-none ginko:transition-colors ginko:hover:text-foreground ginko:xl:block"
            >
              <option value="all">All files</option>
              <option value="used">Used</option>
              <option value="unused">Unused</option>
            </select>
            <select
              v-model="sizeFilter"
              class="ginko:hidden ginko:h-6 ginko:rounded-full ginko:border-0 ginko:bg-muted/60 ginko:pl-2 ginko:pr-5 ginko:text-xs ginko:text-muted-foreground ginko:outline-none ginko:transition-colors ginko:hover:text-foreground ginko:xl:block"
            >
              <option value="any">Any size</option>
              <option value="small">&lt; 100 KB</option>
              <option value="medium">100 KB - 1 MB</option>
              <option value="large">&gt; 1 MB</option>
            </select>
            <button
              v-if="activeFilterCount > 0"
              class="ginko:h-6 ginko:rounded-full ginko:px-2 ginko:text-xs ginko:text-muted-foreground ginko:transition-colors ginko:hover:bg-muted/60 ginko:hover:text-foreground"
              @click="clearFilters"
            >
              Clear
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:sm:hidden"
            aria-label="Filter assets"
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
              placeholder="Search..."
              class="ginko:h-8 ginko:w-full ginko:border-border/40 ginko:bg-card ginko:pl-8 ginko:text-sm ginko:shadow-none"
            />
          </div>

          <Button
            v-if="selectedAssetForDetails"
            variant="ghost"
            size="sm"
            class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:lg:hidden"
            aria-label="Inspect selected asset"
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
            Upload
          </Button>
          <select
            v-if="isPickMode && embedded"
            v-model="uploadDestination"
            class="ginko:h-7 ginko:max-w-40 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-card ginko:px-2 ginko:text-xs ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
            aria-label="Upload destination"
          >
            <option
              v-for="destination in uploadDestinations"
              :key="destination.value"
              :value="destination.value"
              :disabled="destination.disabled"
            >
              {{ destination.label }}
            </option>
          </select>
        </div>

        <div
          v-if="mode === 'manage' && hasAssetSelection"
          class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2 ginko:border-b ginko:bg-muted/20 ginko:px-3 ginko:py-2"
        >
          <Badge variant="outline" class="ginko:text-xs"
            >{{ selectedVisibleAssetIds.length }} selected</Badge
          >
          <Input
            v-model="bulkTagInput"
            placeholder="Tag selected assets..."
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
            Add tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="commitBulkTag('remove')"
          >
            Remove tag
          </Button>
          <Button
            v-if="canBulkShareInCollection"
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="moveAssetsToCollection([...selectedVisibleAssetIds])"
          >
            Make available to this collection
          </Button>
          <Button
            v-if="canBulkMakeGlobal"
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="moveAssetsToGlobal([...selectedVisibleAssetIds])"
          >
            Make available everywhere
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="ginko:h-8 ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
            :disabled="actionPending"
            @click="requestTrashSelectedAssets"
          >
            Move to Trash
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="ginko:ml-auto ginko:h-8 ginko:text-xs"
            :disabled="actionPending"
            @click="clearAssetSelection"
          >
            Clear
          </Button>
        </div>

        <ScrollArea class="ginko:flex-1">
          <div v-if="error || localError" class="ginko:px-6 ginko:pt-4">
            <div
              class="ginko:rounded-lg ginko:border ginko:border-destructive/20 ginko:bg-destructive/5 ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-destructive"
            >
              {{ localError || error }}
            </div>
          </div>

          <div v-if="isLoading" class="ginko:grid ginko:grid-cols-1 ginko:gap-2 ginko:p-6">
            <div
              v-for="index in 12"
              :key="index"
              class="ginko:h-9 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30"
            />
          </div>

          <div
            v-else-if="currentItems.length === 0"
            class="ginko:flex ginko:flex-col ginko:items-center ginko:justify-center ginko:py-24 ginko:text-center"
          >
            <FolderOpen class="ginko:mb-4 ginko:size-12 ginko:text-muted-foreground/20" />
            <p class="ginko:text-sm ginko:text-muted-foreground/70">No items</p>
            <p
              v-if="activeFilterCount > 0"
              class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground/50"
            >
              Try adjusting your filters
            </p>
          </div>

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
                  Name
                </th>
                <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
                  Date Modified
                </th>
                <th
                  class="ginko:px-3 ginko:py-2 ginko:text-right ginko:font-medium ginko:text-muted-foreground/70"
                >
                  Size
                </th>
                <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
                  Kind
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
                            item.asset.deletedAt ? 'line-through ginko:text-muted-foreground' : ''
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
                    >{{ item.count }} item{{ item.count === 1 ? '' : 's' }}</template
                  >
                  <template v-else>{{ formatFileSize(item.asset.size) }}</template>
                </td>
                <td
                  class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-muted-foreground"
                >
                  {{ item.type === 'folder' ? 'Folder' : mimeKind(item.asset.mimeType) }}
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
                  :class="item.asset.deletedAt ? 'line-through ginko:text-muted-foreground' : ''"
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
                {{ isLoadingMoreAssets ? 'Loading…' : 'Load more' }}
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
                {{ multiple && isChosen(selectedAssetForDetails.id) ? 'Remove' : 'Choose' }}
              </Button>
              <div class="ginko:space-y-2.5 ginko:text-xs">
                <div class="ginko:flex ginko:justify-between ginko:gap-3">
                  <span class="ginko:text-muted-foreground/70">Filename</span>
                  <span class="ginko:truncate ginko:font-mono">{{
                    selectedAssetForDetails.filename
                  }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">Kind</span>
                  <span>{{ mimeKind(selectedAssetForDetails.mimeType) }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">Size</span>
                  <span>{{ formatFileSize(selectedAssetForDetails.size) }}</span>
                </div>
                <div v-if="selectedAssetForDetails.width" class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">Dimensions</span>
                  <span
                    >{{ selectedAssetForDetails.width }} x
                    {{ selectedAssetForDetails.height }}</span
                  >
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">Ownership</span>
                  <Badge variant="outline" class="ginko:text-xs">{{
                    ownershipLabel(selectedAssetForDetails)
                  }}</Badge>
                </div>
                <div class="ginko:flex ginko:justify-between ginko:gap-3">
                  <span class="ginko:text-muted-foreground/70">Owner path</span>
                  <span class="ginko:truncate">{{ ownerPathLabel(selectedAssetForDetails) }}</span>
                </div>
                <div
                  v-if="selectedAssetForDetails.collectionLabel"
                  class="ginko:flex ginko:justify-between ginko:gap-3"
                >
                  <span class="ginko:text-muted-foreground/70">Collection</span>
                  <span class="ginko:truncate">{{ selectedAssetForDetails.collectionLabel }}</span>
                </div>
                <div
                  v-if="selectedAssetForDetails.entryTitle"
                  class="ginko:flex ginko:justify-between ginko:gap-3"
                >
                  <span class="ginko:text-muted-foreground/70">Entry</span>
                  <span class="ginko:truncate">{{ selectedAssetForDetails.entryTitle }}</span>
                </div>
                <div class="ginko:flex ginko:justify-between">
                  <span class="ginko:text-muted-foreground/70">Usage</span>
                  <span
                    >{{ selectedAssetForDetails.usages.length }} place{{
                      selectedAssetForDetails.usages.length === 1 ? '' : 's'
                    }}</span
                  >
                </div>
              </div>
              <Separator />
              <div class="ginko:space-y-2">
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs">Language</Label>
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
                  <Label class="ginko:text-xs">Alt Text</Label>
                  <Input v-model="altText" class="ginko:h-8 ginko:text-xs" />
                </div>
                <div class="ginko:space-y-1.5">
                  <Label class="ginko:text-xs">Caption</Label>
                  <Input v-model="captionText" class="ginko:h-8 ginko:text-xs" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  class="ginko:w-full"
                  :disabled="savingMeta"
                  @click="saveMetadata"
                >
                  Save details
                </Button>
              </div>
            </template>
            <div v-else class="ginko:text-sm ginko:text-muted-foreground">
              Select an asset to inspect it.
            </div>
          </div>
        </ScrollArea>
      </aside>

      <Sheet v-model:open="mobileScopesOpen">
        <SheetContent
          side="left"
          class="ginko:w-[19rem] ginko:max-w-[85vw] ginko:p-0 ginko:md:hidden"
        >
          <SheetHeader class="ginko:border-b ginko:pr-12">
            <SheetTitle class="ginko:text-sm">Browse media</SheetTitle>
            <SheetDescription>Choose an owner, tag, view, or trash.</SheetDescription>
          </SheetHeader>
          <ScrollArea class="ginko:flex-1">
            <div class="ginko:py-3">
              <div class="ginko:mb-2">
                <div class="ginko:px-4 ginko:py-1">
                  <span
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                  >
                    Collections
                  </span>
                </div>
                <nav class="ginko:space-y-px ginko:px-2">
                  <button
                    v-for="item in sidebarCollections"
                    :key="`mobile-coll:${item.key}`"
                    class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                    :class="
                      isSidebarActive('collections', item.key)
                        ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                        : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                    "
                    @click="selectMobileSidebar('collections', item.key)"
                  >
                    <Icon
                      :name="item.icon"
                      class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
                    />
                    <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{
                      item.label
                    }}</span>
                    <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                      item.count
                    }}</span>
                  </button>
                </nav>
              </div>

              <div v-if="sidebarTags.length > 0" class="ginko:mb-2">
                <div class="ginko:px-4 ginko:py-1">
                  <span
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                  >
                    Tags
                  </span>
                </div>
                <nav class="ginko:space-y-px ginko:px-2">
                  <button
                    v-for="tag in sidebarTags"
                    :key="`mobile-tag:${tag.key}`"
                    class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                    :class="
                      isSidebarActive('tags', tag.key)
                        ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                        : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                    "
                    @click="selectMobileSidebar('tags', tag.key)"
                  >
                    <div
                      class="ginko:size-[10px] ginko:shrink-0 ginko:rounded-full"
                      :style="{ backgroundColor: tag.color }"
                    />
                    <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{ tag.label }}</span>
                    <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                      tag.count
                    }}</span>
                  </button>
                </nav>
              </div>

              <div class="ginko:mb-2">
                <div class="ginko:px-4 ginko:py-1">
                  <span
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/70"
                  >
                    Library views
                  </span>
                </div>
                <nav class="ginko:space-y-px ginko:px-2">
                  <button
                    v-for="item in sidebarFullViews"
                    :key="`mobile-full:${item.key}`"
                    class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                    :class="
                      isSidebarActive('full', item.key)
                        ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                        : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                    "
                    @click="selectMobileSidebar('full', item.key)"
                  >
                    <Icon
                      :name="item.icon"
                      class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60"
                    />
                    <span class="ginko:flex-1 ginko:truncate ginko:text-left">{{
                      item.label
                    }}</span>
                    <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                      item.count
                    }}</span>
                  </button>
                </nav>
              </div>

              <div v-if="mode === 'manage'" class="ginko:mx-2 ginko:border-t ginko:pt-2">
                <button
                  class="ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2 ginko:py-2 ginko:text-sm ginko:transition-colors"
                  :class="
                    isSidebarActive('trash', 'trash')
                      ? 'ginko:bg-primary ginko:font-medium ginko:text-primary-foreground'
                      : 'ginko:text-foreground/80 ginko:hover:bg-accent'
                  "
                  @click="selectMobileSidebar('trash', 'trash')"
                >
                  <Trash2 class="ginko:size-[15px] ginko:shrink-0 ginko:opacity-60" />
                  <span class="ginko:flex-1 ginko:truncate ginko:text-left">Trash</span>
                  <span class="ginko:text-xs ginko:tabular-nums ginko:opacity-50">{{
                    trashCount
                  }}</span>
                </button>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet v-model:open="mobileFiltersOpen">
        <SheetContent
          side="bottom"
          class="ginko:max-h-[85dvh] ginko:rounded-t-xl ginko:p-0 ginko:sm:hidden"
        >
          <SheetHeader class="ginko:border-b ginko:pr-12">
            <SheetTitle class="ginko:text-sm">Filter media</SheetTitle>
            <SheetDescription>Adjust the current asset view.</SheetDescription>
          </SheetHeader>
          <div class="ginko:grid ginko:gap-3 ginko:p-4">
            <Label class="ginko:text-xs">View</Label>
            <div
              class="ginko:inline-flex ginko:w-fit ginko:items-center ginko:rounded-lg ginko:bg-muted/60 ginko:p-0.5"
            >
              <button
                class="ginko:inline-flex ginko:h-8 ginko:w-8 ginko:items-center ginko:justify-center ginko:rounded-md ginko:transition-[color,background-color] ginko:duration-150 ginko:ease-out"
                :class="
                  viewMode === 'list'
                    ? 'ginko:bg-background'
                    : 'ginko:text-muted-foreground ginko:hover:text-foreground'
                "
                @click="viewMode = 'list'"
              >
                <List class="ginko:size-4" />
              </button>
              <button
                class="ginko:inline-flex ginko:h-8 ginko:w-8 ginko:items-center ginko:justify-center ginko:rounded-md ginko:transition-[color,background-color] ginko:duration-150 ginko:ease-out"
                :class="
                  viewMode === 'grid'
                    ? 'ginko:bg-background'
                    : 'ginko:text-muted-foreground ginko:hover:text-foreground'
                "
                @click="viewMode = 'grid'"
              >
                <Grid3x3 class="ginko:size-4" />
              </button>
            </div>

            <Label class="ginko:text-xs">Sort</Label>
            <select
              v-model="sortBy"
              class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
              <option value="kind">Kind</option>
            </select>

            <Label class="ginko:text-xs">Type</Label>
            <select
              v-model="typeFilter"
              class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
            >
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="document">Documents</option>
            </select>

            <Label class="ginko:text-xs">Date</Label>
            <select
              v-model="timeFilter"
              class="ginko:h-9 ginko:rounded-md ginko:border ginko:bg-background ginko:px-3 ginko:text-sm ginko:outline-none ginko:focus:ring-2 ginko:focus:ring-ring"
            >
              <option value="any">Any time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>

            <div class="ginko:flex ginko:gap-2 ginko:pt-2">
              <Button variant="outline" class="ginko:flex-1" @click="clearFilters">Clear</Button>
              <Button class="ginko:flex-1" @click="mobileFiltersOpen = false">Done</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
                    <span class="ginko:text-muted-foreground/70">Filename</span>
                    <span class="ginko:truncate ginko:font-mono">{{
                      selectedAssetForDetails.filename
                    }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Kind</span>
                    <span>{{ mimeKind(selectedAssetForDetails.mimeType) }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Size</span>
                    <span>{{ formatFileSize(selectedAssetForDetails.size) }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.width"
                    class="ginko:flex ginko:justify-between"
                  >
                    <span class="ginko:text-muted-foreground/70">Dimensions</span>
                    <span
                      >{{ selectedAssetForDetails.width }} x
                      {{ selectedAssetForDetails.height }}</span
                    >
                  </div>
                  <div class="ginko:flex ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">Ownership</span>
                    <Badge variant="outline" class="ginko:text-xs">{{
                      ownershipLabel(selectedAssetForDetails)
                    }}</Badge>
                  </div>
                  <div class="ginko:flex ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">Owner path</span>
                    <span class="ginko:truncate">{{
                      ownerPathLabel(selectedAssetForDetails)
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.collectionLabel"
                    class="ginko:flex ginko:justify-between ginko:gap-3"
                  >
                    <span class="ginko:text-muted-foreground/70">Collection</span>
                    <span class="ginko:truncate">{{
                      selectedAssetForDetails.collectionLabel
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAssetForDetails.entryTitle"
                    class="ginko:flex ginko:justify-between ginko:gap-3"
                  >
                    <span class="ginko:text-muted-foreground/70">Entry</span>
                    <span class="ginko:truncate">{{ selectedAssetForDetails.entryTitle }}</span>
                  </div>
                </div>

                <Separator />

                <div class="ginko:space-y-2">
                  <div
                    class="ginko:rounded-md ginko:border ginko:px-2.5 ginko:py-2 ginko:text-xs"
                    :class="
                      metadataCoverage(selectedAssetForDetails).complete
                        ? 'ginko:border-success/30 ginko:bg-success/10 ginko:text-success-fg'
                        : 'ginko:border-warning/30 ginko:bg-warning/10 ginko:text-warning-fg'
                    "
                  >
                    {{ metadataCoverageLabel(selectedAssetForDetails) }}
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">Language</Label>
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
                    <Label class="ginko:text-xs">Alt Text</Label>
                    <Input
                      v-model="altText"
                      class="ginko:h-9 ginko:text-sm"
                      :disabled="savingMeta"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">Caption</Label>
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
                    Save details
                  </Button>
                  <Button
                    v-if="canCopyDefaultMetadata"
                    size="sm"
                    variant="ghost"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="copyDefaultMetadataToMissingLocales"
                  >
                    Copy default details to missing languages
                  </Button>
                </div>

                <template v-if="mode === 'manage'">
                  <Separator />
                  <div class="ginko:space-y-2">
                    <h4
                      class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                    >
                      Tags
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
                      placeholder="Add tag..."
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
                        Restore
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
                        Make available to this collection
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
                        Make available everywhere
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="ginko:w-full ginko:justify-start ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
                        :disabled="actionPending"
                        @click="requestTrashAsset(selectedAssetForDetails)"
                      >
                        <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                        Move to Trash
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
                {{ multiple && isChosen(selectedAssetForDetails.id) ? 'Remove' : 'Choose' }}
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
                      Tags
                    </h4>
                    <span class="ginko:text-xs ginko:text-muted-foreground/50">
                      {{ selectedAssetTags.length }} tag{{
                        selectedAssetTags.length === 1 ? '' : 's'
                      }}
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
                    placeholder="Add tag..."
                    class="ginko:h-8 ginko:text-xs"
                    :disabled="actionPending"
                    @keydown="handleSelectedTagKeydown"
                  />
                </div>

                <div class="ginko:space-y-2.5 ginko:text-xs">
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Filename</span
                    ><span class="ginko:ml-2 ginko:max-w-[200px] ginko:truncate ginko:font-mono">{{
                      selectedAsset.filename
                    }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Kind</span
                    ><span>{{ mimeKind(selectedAsset.mimeType) }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Size</span
                    ><span>{{ formatFileSize(selectedAsset.size) }}</span>
                  </div>
                  <div v-if="selectedAsset.width" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Dimensions</span
                    ><span>{{ selectedAsset.width }} x {{ selectedAsset.height }}</span>
                  </div>
                  <div class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Created</span
                    ><span>{{ formatDate(selectedAsset.createdAt) }}</span>
                  </div>
                  <div v-if="selectedAsset.updatedAt" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Modified</span
                    ><span>{{ formatDate(selectedAsset.updatedAt) }}</span>
                  </div>
                </div>

                <Separator />

                <div class="ginko:space-y-2">
                  <h4
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                  >
                    Details
                  </h4>
                  <div
                    class="ginko:rounded-md ginko:border ginko:px-2.5 ginko:py-2 ginko:text-xs"
                    :class="
                      metadataCoverage(selectedAsset).complete
                        ? 'ginko:border-success/30 ginko:bg-success/10 ginko:text-success-fg'
                        : 'ginko:border-warning/30 ginko:bg-warning/10 ginko:text-warning-fg'
                    "
                  >
                    {{ metadataCoverageLabel(selectedAsset) }}
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">Language</Label>
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
                          default
                        </span>
                      </button>
                    </div>
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">Alt Text</Label>
                    <Input
                      v-model="altText"
                      class="ginko:h-8 ginko:text-xs"
                      :disabled="savingMeta"
                    />
                  </div>
                  <div class="ginko:space-y-1.5">
                    <Label class="ginko:text-xs">Caption</Label>
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
                    Save details
                  </Button>
                  <Button
                    v-if="canCopyDefaultMetadata"
                    size="sm"
                    variant="ghost"
                    class="ginko:w-full"
                    :disabled="savingMeta"
                    @click="copyDefaultMetadataToMissingLocales"
                  >
                    Copy default details to missing languages
                  </Button>
                </div>

                <Separator />

                <div class="ginko:space-y-2.5 ginko:text-xs">
                  <h4
                    class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                  >
                    Location
                  </h4>
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">Ownership</span
                    ><Badge variant="outline" class="ginko:text-xs">{{
                      ownershipLabel(selectedAsset)
                    }}</Badge>
                  </div>
                  <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                    <span class="ginko:text-muted-foreground/70">Owner path</span
                    ><span class="ginko:ml-2 ginko:max-w-[220px] ginko:truncate">{{
                      ownerPathLabel(selectedAsset)
                    }}</span>
                  </div>
                  <div
                    v-if="selectedAsset.collectionLabel"
                    class="ginko:flex ginko:justify-between"
                  >
                    <span class="ginko:text-muted-foreground/70">Collection</span
                    ><span>{{ selectedAsset.collectionLabel }}</span>
                  </div>
                  <div v-if="selectedAsset.entryTitle" class="ginko:flex ginko:justify-between">
                    <span class="ginko:text-muted-foreground/70">Entry</span
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
                    Usage
                  </h4>
                  <div
                    v-if="selectedAsset.usages.length === 0"
                    class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-warning-fg"
                  >
                    <AlertTriangle class="ginko:size-3.5" />
                    Not used anywhere
                  </div>
                  <template v-else>
                    <p class="ginko:text-xs ginko:text-muted-foreground/60">
                      Used in {{ selectedAsset.usages.length }} place{{
                        selectedAsset.usages.length === 1 ? '' : 's'
                      }}
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
                      Restore
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
                      Make available to this collection
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
                      Make available everywhere
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="ginko:w-full ginko:justify-start ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
                      :disabled="actionPending"
                      @click="requestTrashAsset(selectedAsset)"
                    >
                      <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                      Move to Trash
                    </Button>
                  </template>
                </div>
              </div>
            </ScrollArea>
          </template>
        </SheetContent>
      </Sheet>
    </div>
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
            ? `${pendingDestructiveUsageCount} usage${pendingDestructiveUsageCount === 1 ? '' : 's'} affected`
            : 'No usage found'
        "
        :description="
          pendingDestructiveUsageCount > 0
            ? 'Review affected content before confirming this destructive action.'
            : 'No entries currently reference the selected asset.'
        "
      />
      <div class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3">
        <div
          class="ginko:mb-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
        >
          Affected assets
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
              {{ asset.usages.length }} usage{{ asset.usages.length === 1 ? '' : 's' }}
            </span>
          </div>
          <div
            v-if="pendingDestructiveAffectedAssets.length > 6"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            +{{ pendingDestructiveAffectedAssets.length - 6 }} more
          </div>
        </div>
      </div>
    </div>
  </StudioConfirmDialog>
</template>
