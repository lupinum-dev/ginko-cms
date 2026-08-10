<script setup lang="ts">
import { FileText, FolderX, Loader2, Plus, Search } from '@lucide/vue'
import type { EntryStatus } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionArgs } from 'convex/server'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import StudioCollectionDetailsPanel from '../../components/studio/collections/StudioCollectionDetailsPanel.vue'
import StudioCollectionFlatList from '../../components/studio/collections/StudioCollectionFlatList.vue'
import StudioCollectionTreeList from '../../components/studio/collections/StudioCollectionTreeList.vue'
import { cmsPermissionKeys } from '../../composables/permissions'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioAccess } from '../../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../../composables/useCmsStudioPaginatedQuery'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useRightSidebarPanel } from '../../composables/useRightSidebar'
import { useConvexMutation } from '../../composables/useStudioConvex'
import { useStudioDebug } from '../../composables/useStudioDebug'
import { operationValue } from '../../lib/destructiveWorkflow'
import { publicStateLabel, publicStateTone, readinessActionLabel } from '../../lib/publicWorkflow'
import {
  asTreeRow,
  canEditCollectionEntry,
  localeChipState,
  type DropHint,
  type EnrichedRow,
  type LocaleChipState,
  type StudioEntryRow,
  type StudioEntrySummaryRow,
  type TreeRow,
} from '../../lib/studioCollectionRows'
import { orderStudioTreeRows } from '../../lib/studioTree'

const { can } = useCmsStudioAccess()
const canCreateEntries = can(cmsPermissionKeys.createEntries)
const route = useRoute()
const router = useRouter()
const collection = computed(() => String(route.params.collection))
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const studioSettings = useCmsStudioSettings()
const locale = computed(() => studioSettings.defaultLocale.value)
const studioDebug = useStudioDebug('collection:list')
const collectionQuery = useCmsStudioQuery(
  api.ginkoCms.collections.getCollection,
  computed(() => ({
    slug: collection.value,
  })),
)
studioDebug.watchQueryError('getCollection', collectionQuery, { collection })
const collectionConfig = computed(() => collectionQuery.data.value ?? null)
const collectionLabel = computed(() => {
  const label = collectionConfig.value?.label
  return typeof label === 'string' ? label : collection.value
})
const collectionType = computed(() => collectionConfig.value?.type ?? 'flat')
const isTree = computed(() => collectionType.value === 'tree')
// Language machinery stays invisible on single-locale sites (design review
// principle 6): the Languages column only exists when there is something to
// compare.
const hasMultipleLocales = computed(
  () => ((collectionConfig.value?.locales ?? []) as string[]).length > 1,
)
// List grid templates are container-query driven (@3xl/@5xl of the inset card,
// not the viewport) and the title track is the ONLY flexible one — fixed
// tracks total well under the @3xl floor, so the title can never collapse to
// 0 the way the old fixed 44rem template did beside an open panel.
const listGridClass = computed(() =>
  hasMultipleLocales.value
    ? 'ginko:@3xl:grid-cols-[minmax(0,1fr)_9rem_7rem] ginko:@5xl:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)_9rem_7rem]'
    : 'ginko:@3xl:grid-cols-[minmax(0,1fr)_9rem_7rem]',
)
const isSingleton = computed(() => Boolean(collectionConfig.value?.singleton))
const collectionExists = computed(() => collectionConfig.value !== null)
// Work-queue deep links: filters initialize from the URL (?status=, ?work=,
// ?q=) so Home queue rows can land on a pre-filtered list. Only valid union
// members are accepted; anything else falls back to the default view.
const statusFilterValues: readonly EntryStatus[] = ['draft', 'published', 'archived']
const workStateFilterValues = ['changed', 'blocked', 'missing_translation'] as const
type WorkStateFilter = (typeof workStateFilterValues)[number]
function queryParamString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function statusFilterFromQuery(): 'all' | EntryStatus {
  const value = queryParamString(route.query.status)
  return (statusFilterValues as readonly string[]).includes(value) ? (value as EntryStatus) : 'all'
}
function workStateFilterFromQuery(): 'all' | WorkStateFilter {
  const value = queryParamString(route.query.work)
  return (workStateFilterValues as readonly string[]).includes(value)
    ? (value as WorkStateFilter)
    : 'all'
}
const searchQuery = ref(queryParamString(route.query.q))
const statusFilter = ref<'all' | EntryStatus>(statusFilterFromQuery())
const workStateFilter = ref<'all' | WorkStateFilter>(workStateFilterFromQuery())
// Keep the URL shareable: filter changes mirror into the query without pushing
// history entries, and defaults are omitted so clean URLs stay clean.
watch([statusFilter, workStateFilter, searchQuery], ([status, work, query]) => {
  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'status' || key === 'work' || key === 'q') continue
    if (typeof value === 'string') nextQuery[key] = value
  }
  if (status !== 'all') nextQuery.status = status
  if (work !== 'all') nextQuery.work = work
  if (query) nextQuery.q = query
  void router.replace({ query: nextQuery })
})
// Collection details live in the shell's right sidebar (Phase L; successor of
// the retired action rail). Props getter keeps everything reactive; callbacks
// arrive in the panel as listener props.
useRightSidebarPanel({
  title: () => collectionLabel.value,
  description: () => t('ginkoCms.studio.collectionListPage.detailsPanelDescription'),
  component: StudioCollectionDetailsPanel,
  props: () => ({
    activeFilterLabel: activeFilterLabel.value,
    canCreateEntries: canCreateEntries.value,
    collectionExists: collectionExists.value,
    collectionType: collectionType.value,
    hasActiveFilters: hasActiveFilters.value,
    isSingleton: isSingleton.value,
    newEntryTo: `${contentRoute}/${collection.value}/new`,
    stats: collectionRailStats.value,
    onClearFilters: clearFilters,
    onSetWorkState: setWorkStateFilter,
  }),
  defaultOpen: false,
  compact: true,
})

const pageSize = computed(() => (isTree.value ? 100 : 50))
const listArgs = computed(() => {
  if (!collectionExists.value || workStateFilter.value !== 'all') {
    return 'skip' as const
  }
  return {
    collection: collection.value,
    locale: locale.value,
    parentEntryId: null,
    ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
    ...(searchQuery.value.trim() ? { query: searchQuery.value.trim() } : {}),
  }
})
const listQuery = useCmsStudioPaginatedQuery(api.ginkoCms.editor.listEntriesForStudio, listArgs, {
  initialNumItems: pageSize.value,
})
studioDebug.watchQueryError('listEntriesForStudio', listQuery, { collection })
const summaryArgs = computed<
  Omit<FunctionArgs<typeof api.ginkoCms.editor.listEntrySummaries>, 'paginationOpts'> | 'skip'
>(() => {
  if (!collectionExists.value || workStateFilter.value === 'all') return 'skip'
  return {
    collection: collection.value,
    locale: locale.value,
    workState: workStateFilter.value === 'blocked' ? 'needs_attention' : workStateFilter.value,
    ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
    ...(searchQuery.value.trim() ? { query: searchQuery.value.trim() } : {}),
  }
})
const summaryQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listEntrySummaries,
  summaryArgs,
  { initialNumItems: pageSize.value },
)
studioDebug.watchQueryError('listEntrySummaries', summaryQuery, { collection })
const rows = computed<StudioEntryRow[]>(() =>
  (listQuery.data.value ?? []).map((item) => {
    const row = item as unknown as StudioEntryRow & { baseSlug?: string }
    return { ...row, slug: row.baseSlug ?? row.slug }
  }),
)
watchEffect(async () => {
  const currentCollection = collectionConfig.value
  if (!currentCollection || !currentCollection.singleton || listQuery.isLoading.value) {
    return
  }
  const firstEntry = rows.value[0]
  const target = firstEntry
    ? `${contentRoute}/${collection.value}/${firstEntry._id}`
    : `${contentRoute}/${collection.value}/new`
  if (route.fullPath !== target) {
    await router.replace(target)
  }
})
const flatRows = computed(() => [...rows.value])
const summaryRows = computed<StudioEntryRow[]>(() =>
  ((summaryQuery.data.value ?? []) as readonly StudioEntrySummaryRow[]).map((row) => ({
    _id: row.entryId,
    slug: row.slug,
    path: row.path,
    title: row.title,
    status: row.status,
    dirtyLocales: row.localeReadiness.filter((item) => item.changed).map((item) => item.locale),
    updatedAt: row.updatedAt,
    parentEntryId: row.parentEntryId,
    orderRank: '',
    nodeKind: row.nodeKind,
    data: {},
    localeSummaries: row.localeReadiness.map((item) => ({
      locale: item.locale,
      published: item.published,
    })),
    localeReadinessStates: row.workflowSummary?.readinessStatesByLocale,
    publicState: row.publicState,
    draftChangedSincePublish: row.draftChangedSincePublish,
    blockingIssueCount: row.blockingIssueCount,
    missingTranslationLocales: row.missingTranslationLocales,
    nextAction: row.nextAction,
    _can: row._can,
  })),
)
const treeRows = computed<TreeRow[]>(() =>
  orderStudioTreeRows(
    rows.value.map((row) => ({
      ...row,
      kind: row.nodeKind,
      order: row.orderRank,
      localeVariants: row.localeSummaries,
    })),
  ),
)
const showTreeView = computed(
  () => isTree.value && workStateFilter.value === 'all' && !searchQuery.value.trim(),
)
const visibleRows = computed(() => {
  if (workStateFilter.value !== 'all') return summaryRows.value
  return showTreeView.value ? treeRows.value : flatRows.value
})
const enrichedRows = computed<EnrichedRow[]>(() =>
  visibleRows.value.map((row) => {
    const treeRow = asTreeRow(row)
    const dirtyLocales = row.dirtyLocales ?? []
    const missingTranslationLocales =
      row.missingTranslationLocales ??
      ((collectionConfig.value?.locales ?? []) as string[]).filter((localeCode: string) => {
        const summary = row.localeSummaries.find((item) => item.locale === localeCode)
        return (
          localeChipState(row, summary ?? { locale: localeCode, published: false }) === 'missing'
        )
      })
    const draftChangedSincePublish =
      row.draftChangedSincePublish ?? (row.status !== 'published' || dirtyLocales.length > 0)
    const blockingIssueCount = row.blockingIssueCount ?? 0
    // The pill tells the entry-level truth (canonical editorial states): once
    // any language is live the entry is Live, never "Draft only". Pending
    // edits show as "Live · edited"; per-language detail lives in the chips.
    const publicState =
      row.publicState === 'data_only' || collectionConfig.value?.mode === 'none'
        ? 'data_only'
        : blockingIssueCount > 0 || row.publicState === 'needs_attention'
          ? 'needs_attention'
          : row.status === 'published'
            ? 'public'
            : 'draft_only'
    const liveWithEdits = publicState === 'public' && dirtyLocales.length > 0
    const workflowNextAction = row.workflowSummary?.nextAction?.kind
      ? readinessActionLabel(t, row.workflowSummary.nextAction.kind)
      : null
    return {
      ...treeRow,
      publicState,
      publicStateLabel:
        row.status === 'archived'
          ? t('ginkoCms.common.archived')
          : liveWithEdits
            ? t('ginkoCms.studio.collectionListPage.liveEdited')
            : publicStateLabel(t, publicState),
      publicStateTone: row.status === 'archived' ? 'neutral' : publicStateTone(publicState),
      draftChangedSincePublish,
      blockingIssueCount,
      missingTranslationLocales,
      nextAction:
        row.status === 'archived'
          ? t('ginkoCms.common.archived')
          : (row.nextAction ?? workflowNextAction ?? 'Open entry'),
    }
  }),
)
const collectionRailStats = computed(() => ({
  totalVisibleEntries: enrichedRows.value.length,
  publicEntryCount: enrichedRows.value.filter((row) => row.publicState === 'public').length,
  draftOnlyEntryCount: enrichedRows.value.filter((row) => row.publicState === 'draft_only').length,
  blockedEntryCount: enrichedRows.value.filter((row) => row.blockingIssueCount > 0).length,
  missingTranslationEntryCount: enrichedRows.value.filter(
    (row) => row.missingTranslationLocales.length > 0,
  ).length,
}))
const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim().length > 0 ||
    statusFilter.value !== 'all' ||
    workStateFilter.value !== 'all',
)
const activeFilterLabel = computed(() => {
  const filters: string[] = []
  if (searchQuery.value.trim()) filters.push('Search')
  if (statusFilter.value !== 'all') filters.push(statusFilter.value)
  if (workStateFilter.value !== 'all') filters.push(workStateFilter.value.replace(/_/g, ' '))
  return filters.length > 0 ? filters.join(' · ') : 'All content'
})
const actionError = ref('')
const { t, dateLocale } = useCmsI18n()
const queryError = computed(
  () => collectionQuery.error.value ?? listQuery.error.value ?? summaryQuery.error.value,
)
const pageError = computed(
  () =>
    actionError.value ||
    (queryError.value
      ? getCmsErrorMessage(queryError.value, t('ginkoCms.studio.collectionListPage.loadError'))
      : ''),
)
const isLoadingList = computed(
  () =>
    !queryError.value &&
    visibleRows.value.length === 0 &&
    (collectionQuery.pending.value ||
      (workStateFilter.value === 'all' ? listQuery.isLoading.value : summaryQuery.isLoading.value)),
)
const isLoadingMore = computed(
  () =>
    visibleRows.value.length > 0 &&
    (workStateFilter.value === 'all' ? listQuery.isLoading.value : summaryQuery.isLoading.value),
)
const hasMore = computed(() =>
  workStateFilter.value === 'all' ? listQuery.canLoadMore.value : summaryQuery.canLoadMore.value,
)
const isMissingCollection = computed(
  () => !collectionQuery.pending.value && !collectionExists.value && !queryError.value,
)
const reorderMutation = useConvexMutation(api.ginkoCms.editor.reorderEntry)
const previewReorderMutation = useConvexMutation(api.ginkoCms.editor.previewReorderEntryOperation)
const reparentMutation = useConvexMutation(api.ginkoCms.editor.reparentEntry)
const previewReparentMutation = useConvexMutation(api.ginkoCms.editor.previewReparentEntryOperation)
const draggingId = ref<string | null>(null)
const dropHint = ref<DropHint | null>(null)
function loadMore() {
  if (workStateFilter.value === 'all') listQuery.loadMore(pageSize.value)
  else summaryQuery.loadMore(pageSize.value)
}
function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  workStateFilter.value = 'all'
}
function setWorkStateFilter(state: 'missing_translation' | 'blocked') {
  workStateFilter.value = state
}
function startDrag(id: string): void {
  const row = rows.value.find((candidate) => candidate._id === id)
  if (!canEditCollectionEntry(row)) return
  draggingId.value = id
  dropHint.value = null
}
function endDrag() {
  draggingId.value = null
  dropHint.value = null
}
function detectDropMode(event: DragEvent, _target: StudioEntryRow): 'before' | 'after' | 'inside' {
  const element = event.currentTarget as HTMLElement | null
  if (!element || !isTree.value) {
    return 'after'
  }
  const rect = element.getBoundingClientRect()
  if (event.clientX > rect.left + Math.min(120, rect.width * 0.45)) {
    return 'inside'
  }
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}
function onDragOver(event: DragEvent, target: StudioEntryRow): void {
  const source = rows.value.find((candidate) => candidate._id === draggingId.value)
  if (
    !canEditCollectionEntry(source) ||
    !canEditCollectionEntry(target) ||
    !draggingId.value ||
    draggingId.value === target._id
  )
    return
  event.preventDefault()
  dropHint.value = {
    targetId: target._id,
    mode: detectDropMode(event, target),
  }
}
async function onDrop(event: DragEvent, target: StudioEntryRow): Promise<void> {
  const source = rows.value.find((candidate) => candidate._id === draggingId.value)
  if (
    !canEditCollectionEntry(source) ||
    !canEditCollectionEntry(target) ||
    !draggingId.value ||
    draggingId.value === target._id ||
    typeof source.draftVersion !== 'number'
  )
    return
  event.preventDefault()
  actionError.value = ''
  const mode = detectDropMode(event, target)
  const payload: {
    entryId: string
    expectedDraftVersion: number
    parentEntryId?: string
    beforeEntryId?: string
    afterEntryId?: string
  } = { entryId: draggingId.value, expectedDraftVersion: source.draftVersion }
  let targetParentEntryId: string | null
  if (mode === 'inside' && isTree.value) {
    payload.parentEntryId = target._id
    targetParentEntryId = target._id
  } else {
    targetParentEntryId = target.parentEntryId
    if (target.parentEntryId) {
      payload.parentEntryId = target.parentEntryId
    }
    if (mode === 'before') {
      payload.beforeEntryId = target._id
    } else {
      payload.afterEntryId = target._id
    }
  }
  try {
    await executeTreeMove(
      source.parentEntryId === targetParentEntryId ? 'reorder' : 'reparent',
      payload,
    )
  } catch (error) {
    actionError.value = getCmsErrorMessage(
      error,
      t('ginkoCms.studio.collectionListPage.reorderError'),
    )
  } finally {
    endDrag()
  }
}
async function dropToRoot() {
  const source = rows.value.find((candidate) => candidate._id === draggingId.value)
  if (
    !canEditCollectionEntry(source) ||
    !draggingId.value ||
    !isTree.value ||
    typeof source.draftVersion !== 'number'
  )
    return
  actionError.value = ''
  try {
    await executeTreeMove(source.parentEntryId === null ? 'reorder' : 'reparent', {
      entryId: draggingId.value,
      expectedDraftVersion: source.draftVersion,
    })
  } catch (error) {
    actionError.value = getCmsErrorMessage(error, t('ginkoCms.studio.collectionListPage.moveError'))
  } finally {
    endDrag()
  }
}

type TreeMovePayload = {
  entryId: string
  expectedDraftVersion: number
  parentEntryId?: string
  beforeEntryId?: string
  afterEntryId?: string
}

async function executeTreeMove(
  kind: 'reorder' | 'reparent',
  payload: TreeMovePayload,
): Promise<void> {
  const preview =
    kind === 'reorder'
      ? await previewReorderMutation(payload)
      : await previewReparentMutation(payload)
  const confirmation = preview.confirmation
  if (!confirmation?.token) {
    throw new Error(`Tree move preview was blocked: ${JSON.stringify(preview.blockers ?? [])}`)
  }
  const executePayload = { ...payload, _confirmationToken: confirmation.token }
  if (kind === 'reorder') operationValue(await reorderMutation(executePayload))
  else operationValue(await reparentMutation(executePayload))
}
const localeChipLabels = computed<Record<LocaleChipState, string>>(() => ({
  live: t('ginkoCms.studio.collectionListPage.localeLive'),
  live_with_changes: t('ginkoCms.studio.collectionListPage.liveEdited'),
  draft: t('ginkoCms.studio.collectionListPage.localeDraft'),
  missing: t('ginkoCms.studio.workflow.states.missing'),
}))
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader :title="collectionLabel">
        <template #actions>
          <Badge variant="soft">
            {{
              isTree
                ? t('ginkoCms.studio.collectionsPage.typeTree')
                : t('ginkoCms.studio.collectionsPage.typeFlat')
            }}
          </Badge>
          <Button v-if="collectionExists && canCreateEntries && !isSingleton" as-child size="sm">
            <RouterLink :to="`${contentRoute}/${collection}/new`">
              <Plus class="ginko:mr-1.5 ginko:size-3.5" />
              {{ t('ginkoCms.studio.collectionListPage.newEntry') }}
            </RouterLink>
          </Button>
        </template>
      </StudioPageHeader>
    </template>

    <!-- Search & filter bar -->
    <template #toolbar>
      <div
        class="ginko:shrink-0 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:lg:px-6"
      >
        <div
          class="studio-page-content studio-page-content--wide studio-toolbar-row ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:py-1.5"
        >
          <div
            class="ginko:relative ginko:min-w-0 ginko:flex-1 ginko:basis-full ginko:@2xl:basis-64"
          >
            <Search
              class="ginko:pointer-events-none ginko:absolute ginko:left-2.5 ginko:top-1/2 ginko:size-3.5 ginko:-translate-y-1/2 ginko:text-muted-foreground/60"
            />
            <Input
              v-model="searchQuery"
              :placeholder="t('ginkoCms.studio.collectionListPage.searchPlaceholder')"
              class="ginko:h-8 ginko:border-border/40 ginko:bg-card ginko:pl-8 ginko:text-sm ginko:shadow-none"
            />
          </div>

          <Select v-model="statusFilter">
            <SelectTrigger
              class="ginko:h-8 ginko:w-36 ginko:text-xs"
              :aria-label="t('ginkoCms.common.status')"
            >
              <SelectValue :placeholder="t('ginkoCms.common.status')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {{ t('ginkoCms.common.allStatuses') }}
              </SelectItem>
              <SelectItem value="draft">
                {{ t('ginkoCms.common.draft') }}
              </SelectItem>
              <SelectItem value="published">
                {{ t('ginkoCms.common.publishedStatus') }}
              </SelectItem>
              <SelectItem value="archived">
                {{ t('ginkoCms.common.archived') }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select v-model="workStateFilter">
            <SelectTrigger class="ginko:h-8 ginko:w-44 ginko:text-xs" aria-label="Publishing work">
              <SelectValue placeholder="Publishing work" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All work</SelectItem>
              <SelectItem value="changed">Drafts to continue</SelectItem>
              <SelectItem value="blocked">Needs attention</SelectItem>
              <SelectItem value="missing_translation">Missing languages</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </template>

    <ScrollArea class="ginko:flex-1">
      <StudioPageBody width="wide">
        <!-- Error -->
        <StudioNotice v-if="pageError" tone="danger" :description="pageError" class="ginko:mb-4" />

        <!-- Loading state -->
        <div
          v-if="isLoadingList"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            v-for="i in 6"
            :key="`skeleton-entry-${i}`"
            class="ginko:flex ginko:items-center ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:last:border-b-0"
          >
            <div class="ginko:min-w-0 ginko:flex-1 ginko:space-y-2">
              <Skeleton class="ginko:h-4" :style="{ width: `${30 + ((i * 13) % 40)}%` }" />
              <Skeleton class="ginko:h-3 ginko:w-32" />
            </div>
            <Skeleton class="ginko:h-5 ginko:w-16 ginko:rounded-full ginko:shrink-0" />
          </div>
        </div>

        <!-- Missing collection state -->
        <StudioEmptyState
          v-else-if="isMissingCollection"
          :title="t('ginkoCms.studio.collectionListPage.collectionUnavailableTitle')"
          :description="t('ginkoCms.studio.collectionListPage.collectionUnavailableDescription')"
        >
          <template #icon>
            <FolderX class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <!-- Filtered no-match state: content exists, the filters hide it, so
             the honest next action is clearing them, not creating more. -->
        <StudioEmptyState
          v-else-if="enrichedRows.length === 0 && hasActiveFilters"
          :title="t('ginkoCms.studio.collectionListPage.emptyFilteredTitle')"
          :description="t('ginkoCms.studio.collectionListPage.emptyFilteredDescription')"
        >
          <template #icon>
            <Search class="ginko:size-5" aria-hidden="true" />
          </template>
          <template #action>
            <div class="ginko:flex ginko:flex-wrap ginko:justify-center ginko:gap-2">
              <Button v-if="hasMore" variant="outline" size="sm" @click="loadMore">
                {{ t('ginkoCms.common.loadMore') }}
              </Button>
              <Button variant="outline" size="sm" @click="clearFilters">
                {{ t('ginkoCms.studio.collectionListPage.clearFilters') }}
              </Button>
            </div>
          </template>
        </StudioEmptyState>

        <!-- Truly empty collection -->
        <StudioEmptyState
          v-else-if="enrichedRows.length === 0"
          :title="t('ginkoCms.studio.collectionListPage.emptyTitle')"
          :description="t('ginkoCms.studio.collectionListPage.emptyDescription')"
        >
          <template #icon>
            <FileText class="ginko:size-5" aria-hidden="true" />
          </template>
          <template v-if="collectionExists && canCreateEntries && !isSingleton" #action>
            <Button as-child size="sm">
              <RouterLink :to="`${contentRoute}/${collection}/new`">
                <Plus class="ginko:mr-1.5 ginko:size-3.5" />
                {{ t('ginkoCms.studio.collectionListPage.newEntry') }}
              </RouterLink>
            </Button>
          </template>
        </StudioEmptyState>

        <!-- Content -->
        <div v-else>
          <!-- Tree: drop-to-root zone -->
          <div
            v-if="showTreeView && draggingId"
            class="ginko:mb-4 ginko:rounded-lg ginko:border ginko:border-dashed ginko:px-4 ginko:py-3 ginko:text-center ginko:text-sm ginko:text-muted-foreground"
            @dragover.prevent
            @drop.prevent="dropToRoot"
          >
            {{ t('ginkoCms.studio.collectionListPage.dropToRoot') }}
          </div>

          <StudioCollectionTreeList
            v-if="showTreeView"
            :collection="collection"
            :content-route="contentRoute"
            :dragging-id="draggingId"
            :drop-hint="dropHint"
            :has-multiple-locales="hasMultipleLocales"
            :locale-chip-labels="localeChipLabels"
            :rows="enrichedRows"
            @drag-end="endDrag"
            @drag-over="onDragOver"
            @drag-start="startDrag"
            @drop="onDrop"
          />

          <StudioCollectionFlatList
            v-else
            :collection="collection"
            :content-route="contentRoute"
            :date-locale="dateLocale"
            :drop-hint="dropHint"
            :has-multiple-locales="hasMultipleLocales"
            :is-tree="isTree"
            :list-grid-class="listGridClass"
            :locale-chip-labels="localeChipLabels"
            :rows="enrichedRows"
            @drag-end="endDrag"
            @drag-over="onDragOver"
            @drag-start="startDrag"
            @drop="onDrop"
            @open="(id) => router.push(`${contentRoute}/${collection}/${id}`)"
          />

          <!-- Load more -->
          <div class="ginko:flex ginko:justify-center ginko:py-4">
            <Button
              v-if="hasMore"
              variant="ghost"
              size="sm"
              :disabled="isLoadingMore"
              @click="loadMore"
            >
              <Loader2 v-if="isLoadingMore" class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin" />
              {{ t('ginkoCms.common.loadMore') }}
            </Button>
          </div>
        </div>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
