<script setup lang="ts">
import { FileText, FolderX, GripVertical, Loader2, Pencil, Plus, Search } from '@lucide/vue'
import type { EntryStatus } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionArgs } from 'convex/server'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import StudioCollectionDetailsPanel from '../../components/studio/collections/StudioCollectionDetailsPanel.vue'
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
import { codeDefinedCollectionDetail } from '../../lib/codeDefinedCollections'
import { publicStateLabel, publicStateTone, readinessActionLabel } from '../../lib/publicWorkflow'
import { orderStudioTreeRows } from '../../lib/studioTree'

const { can } = useCmsStudioAccess()
const canCreateEntries = can(cmsPermissionKeys.createEntries)
const canManageCollections = can(cmsPermissionKeys.manageCollections)
const route = useRoute()
const router = useRouter()
const collection = computed(() => String(route.params.collection))
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const studioSettings = useCmsStudioSettings()
const locale = computed(() => studioSettings.defaultLocale.value)
const studioDebug = useStudioDebug('collection:list')
const configuredCollection = computed(() => cmsConfig.collections?.[collection.value] ?? null)
const collectionQuery = useCmsStudioQuery(
  api.ginkoCms.collections.getCollection,
  computed(() => ({
    slug: collection.value,
  })),
)
studioDebug.watchQueryError('getCollection', collectionQuery, { collection })
const collectionConfig = computed(
  () =>
    collectionQuery.data.value ??
    codeDefinedCollectionDetail(collection.value, configuredCollection.value, locale.value),
)
const collectionLabel = computed(() => {
  const label = collectionConfig.value?.label ?? configuredCollection.value?.label
  return typeof label === 'string' ? label : collection.value
})
const collectionType = computed(
  () => collectionConfig.value?.type ?? configuredCollection.value?.type ?? 'flat',
)
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
const isSingleton = computed(() =>
  Boolean(collectionConfig.value?.singleton ?? configuredCollection.value?.routing?.singleton),
)
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

type LocaleSummary = {
  locale: string
  published: boolean
  draftExists?: boolean
  updatedAt?: number
}

type StudioEntryRow = {
  _id: string
  slug: string
  path: string
  title: string
  status: EntryStatus
  dirtyLocales?: string[]
  updatedAt: number
  parentEntryId: string | null
  orderRank: string
  nodeKind: string
  data: Record<string, unknown>
  localeSummaries: LocaleSummary[]
  publicState?: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  draftChangedSincePublish?: boolean
  blockingIssueCount?: number
  missingTranslationLocales?: string[]
  localeReadinessStates?: Record<string, string>
  nextAction?: string
  workflowSummary?: {
    nextAction?: {
      kind: string
    } | null
  }
  _can?: Record<string, boolean>
}

type StudioEntrySummaryRow = {
  _id: string
  entryId: string
  collection: string
  title: string
  slug: string
  path: string
  status: EntryStatus
  routeMode: 'route' | 'none'
  nodeKind: string
  parentEntryId: string | null
  updatedAt: number
  publishedAt: number | null
  publicState: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  draftChangedSincePublish: boolean
  blockingIssueCount: number
  missingTranslationLocales: string[]
  localeReadiness: Array<LocaleSummary & { state: string; changed: boolean; draftPath: string }>
  workflowSummary?: {
    readinessStatesByLocale?: Record<string, string>
  }
  nextAction: string
  _can?: Record<string, boolean>
}

type TreeRow = StudioEntryRow & {
  depth: number
  kind: string
  order: string
  localeVariants: LocaleSummary[]
}

type EnrichedRow = TreeRow & {
  publicState: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  publicStateLabel: string
  publicStateTone: 'success' | 'warning' | 'danger' | 'neutral'
  draftChangedSincePublish: boolean
  blockingIssueCount: number
  missingTranslationLocales: string[]
  nextAction: string
}

function asTreeRow(row: StudioEntryRow | TreeRow): TreeRow {
  if (
    typeof (row as Partial<TreeRow>).depth === 'number' &&
    typeof (row as Partial<TreeRow>).kind === 'string' &&
    typeof (row as Partial<TreeRow>).order === 'string' &&
    Array.isArray((row as Partial<TreeRow>).localeVariants)
  ) {
    return row as TreeRow
  }
  return {
    ...row,
    depth: 0,
    kind: row.nodeKind,
    order: row.orderRank,
    localeVariants: row.localeSummaries,
  }
}

const pageSize = computed(() => (isTree.value ? 100 : 50))
const listArgs = computed(() => {
  if (!collectionExists.value) {
    return null
  }
  return {
    collection: collection.value,
    locale: locale.value,
    ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
    ...(searchQuery.value.trim() ? { query: searchQuery.value.trim() } : {}),
  }
})
const listQuery = useCmsStudioPaginatedQuery(api.ginkoCms.editor.listEntriesForStudio, listArgs, {
  initialNumItems: pageSize.value,
})
studioDebug.watchQueryError('listEntriesForStudio', listQuery, { collection })
const summaryArgs = computed<FunctionArgs<typeof api.ginkoCms.editor.listEntrySummaries> | null>(
  () => {
    if (!collectionExists.value || workStateFilter.value === 'all') return null
    return {
      collection: collection.value,
      locale: locale.value,
      workState: workStateFilter.value === 'blocked' ? 'needs_attention' : workStateFilter.value,
      ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
      ...(searchQuery.value.trim() ? { query: searchQuery.value.trim() } : {}),
      limit: 150,
    }
  },
)
const summaryQuery = useCmsStudioQuery(api.ginkoCms.editor.listEntrySummaries, summaryArgs)
studioDebug.watchQueryError('listEntrySummaries', summaryQuery, { collection })
const rows = computed<StudioEntryRow[]>(() =>
  listQuery.results.value.map((item) => {
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
  ((summaryQuery.data.value ?? []) as StudioEntrySummaryRow[]).map((row) => ({
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
const queryError = computed(() => collectionQuery.error.value ?? listQuery.error.value)
const pageError = computed(
  () =>
    actionError.value ||
    (queryError.value
      ? getCmsErrorMessage(queryError.value, t('ginkoCms.studio.collectionListPage.loadError'))
      : ''),
)
const isCollectionSyncing = computed(
  () =>
    configuredCollection.value !== null &&
    canManageCollections.value &&
    !collectionExists.value &&
    !collectionQuery.pending.value &&
    !collectionQuery.error.value,
)
const isLoadingList = computed(
  () =>
    !queryError.value &&
    visibleRows.value.length === 0 &&
    (collectionQuery.pending.value || listQuery.isLoading.value || isCollectionSyncing.value),
)
const isLoadingMore = computed(() => visibleRows.value.length > 0 && listQuery.isLoading.value)
const hasMore = computed(() => listQuery.hasNextPage.value)
const isMissingCollection = computed(
  () =>
    !collectionQuery.pending.value &&
    !collectionExists.value &&
    !isCollectionSyncing.value &&
    !queryError.value,
)
const reorderMutation = useConvexMutation(api.ginkoCms.editor.reorderEntry)
const draggingId = ref<string | null>(null)
const dropHint = ref<{
  targetId: string
  mode: 'before' | 'after' | 'inside'
} | null>(null)
function canEditRow(row: StudioEntryRow | undefined): boolean {
  const can = row?._can
  return can?.edit === true
}
function loadMore() {
  listQuery.loadMore(pageSize.value)
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
  if (!canEditRow(row)) return
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
    !canEditRow(source) ||
    !canEditRow(target) ||
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
    !canEditRow(source) ||
    !canEditRow(target) ||
    !draggingId.value ||
    draggingId.value === target._id
  )
    return
  event.preventDefault()
  actionError.value = ''
  const mode = detectDropMode(event, target)
  const payload: {
    entryId: string
    parentEntryId?: string
    beforeEntryId?: string
    afterEntryId?: string
  } = { entryId: draggingId.value }
  if (mode === 'inside' && isTree.value) {
    payload.parentEntryId = target._id
  } else {
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
    await reorderMutation(payload)
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
  if (!canEditRow(source) || !draggingId.value || !isTree.value) return
  actionError.value = ''
  try {
    await reorderMutation({ entryId: draggingId.value, parentEntryId: void 0 })
  } catch (error) {
    actionError.value = getCmsErrorMessage(error, t('ginkoCms.studio.collectionListPage.moveError'))
  } finally {
    endDrag()
  }
}
// Per-language chips use the canonical editorial states (userstories.md) so
// the list tells the same story as the editor rail: a locale without any work
// is "Missing language", not a fake amber "Draft". Live-and-edited locales
// stay green; the "· edited" suffix carries the nuance.
type LocaleChipState = 'live' | 'live_with_changes' | 'draft' | 'missing'
function localeChipState(
  row: Pick<StudioEntryRow, 'dirtyLocales' | 'localeReadinessStates'>,
  variant: LocaleSummary,
): LocaleChipState {
  // Work-filtered rows carry the backend readiness projection; use it as-is.
  const exact = row.localeReadinessStates?.[variant.locale]
  if (exact === 'live' || exact === 'live_with_changes' || exact === 'missing') return exact
  if (exact) return 'draft'
  const dirty = (row.dirtyLocales ?? []).includes(variant.locale)
  if (variant.published) return dirty ? 'live_with_changes' : 'live'
  // The backend flag is the truth: a locale exists exactly when a draft row
  // does, so the list tells the same story as the editor rail.
  return (variant.draftExists ?? dirty) ? 'draft' : 'missing'
}
const localeChipLabels = computed<Record<LocaleChipState, string>>(() => ({
  live: t('ginkoCms.studio.collectionListPage.localeLive'),
  live_with_changes: t('ginkoCms.studio.collectionListPage.liveEdited'),
  draft: t('ginkoCms.studio.collectionListPage.localeDraft'),
  missing: t('ginkoCms.studio.workflow.states.missing'),
}))
const localeChipClasses: Record<LocaleChipState, string> = {
  live: 'ginko:bg-success/10 ginko:text-success-fg ginko:dark:bg-success/20',
  live_with_changes: 'ginko:bg-success/10 ginko:text-success-fg ginko:dark:bg-success/20',
  draft: 'ginko:bg-muted ginko:text-muted-foreground',
  missing: 'ginko:bg-warning/10 ginko:text-warning-fg ginko:dark:bg-warning/20',
}
const kindColors: Record<string, string> = {
  section: 'ginko:bg-warning/15 ginko:text-warning-fg ginko:dark:bg-warning/25',
  group: 'ginko:bg-primary/10 ginko:text-primary ginko:dark:bg-primary/20',
  folder: 'ginko:bg-success/15 ginko:text-success-fg ginko:dark:bg-success/25',
  page: 'ginko:bg-muted ginko:text-muted-foreground',
}
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
            <Button variant="outline" size="sm" @click="clearFilters">
              {{ t('ginkoCms.studio.collectionListPage.clearFilters') }}
            </Button>
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

          <!-- Tree view -->
          <div
            v-if="showTreeView"
            class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
          >
            <div
              v-for="row in enrichedRows"
              :key="row._id"
              :draggable="canEditRow(row)"
              class="ginko:group ginko:border-b ginko:border-border/60 ginko:px-3 ginko:py-2.5 ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-muted/30"
              :class="[
                draggingId === row._id ? 'ginko:opacity-40' : '',
                dropHint && dropHint.targetId === row._id
                  ? dropHint.mode === 'inside'
                    ? 'ginko:ring-2 ginko:ring-primary ginko:bg-primary/5'
                    : dropHint.mode === 'before'
                      ? 'ginko:border-t-2 ginko:border-primary'
                      : 'ginko:border-b-2 ginko:border-primary'
                  : '',
              ]"
              @dragstart="startDrag(row._id)"
              @dragend="endDrag"
              @dragover="onDragOver($event, row)"
              @drop="onDrop($event, row)"
            >
              <div
                class="ginko:flex ginko:items-center ginko:gap-2.5"
                :style="{ paddingLeft: `${row.depth * 20}px` }"
              >
                <button
                  type="button"
                  class="ginko:cursor-grab ginko:text-muted-foreground/40 ginko:hover:text-muted-foreground ginko:opacity-0 ginko:group-hover:opacity-100 ginko:transition-opacity"
                  @mousedown.stop
                  @click.stop
                >
                  <GripVertical class="ginko:size-3.5" />
                </button>

                <span
                  class="ginko:rounded-md ginko:px-1.5 ginko:py-0.5 ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-wide"
                  :class="kindColors[row.kind] ?? kindColors.page"
                >
                  {{ row.kind }}
                </span>

                <div class="ginko:min-w-0 ginko:flex-1">
                  <RouterLink
                    :to="`${contentRoute}/${collection}/${row._id}`"
                    class="ginko:block ginko:rounded-sm ginko:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
                  >
                    <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                      {{ row.title || row.slug }}
                    </div>
                    <div
                      class="ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground/60"
                    >
                      {{ row.path }}
                    </div>
                  </RouterLink>
                </div>

                <div
                  v-if="hasMultipleLocales"
                  class="ginko:hidden ginko:items-center ginko:gap-1 ginko:@3xl:flex"
                >
                  <span
                    v-for="variant in row.localeVariants"
                    :key="variant.locale"
                    class="ginko:rounded ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
                    :class="localeChipClasses[localeChipState(row, variant)]"
                  >
                    {{ variant.locale.toUpperCase() }} ·
                    {{ localeChipLabels[localeChipState(row, variant)] }}
                  </span>
                </div>

                <StudioStatusPill
                  :label="row.publicStateLabel"
                  :tone="row.publicStateTone"
                  class="ginko:hidden ginko:@3xl:inline-flex"
                />

                <div class="ginko:flex ginko:items-center ginko:gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="ginko:size-7 ginko:p-0 ginko:text-muted-foreground ginko:hover:text-foreground"
                    as-child
                    @click.stop
                  >
                    <RouterLink
                      :to="`${contentRoute}/${collection}/${row._id}`"
                      :aria-label="`Edit ${row.title || row.slug}`"
                    >
                      <Pencil class="ginko:size-3.5" />
                    </RouterLink>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- Flat list view -->
          <div
            v-else
            class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
          >
            <div
              class="ginko:hidden ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-5 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:@3xl:grid"
              :class="listGridClass"
            >
              <div>{{ t('ginkoCms.studio.collectionListPage.titleColumn') }}</div>
              <div v-if="hasMultipleLocales" class="ginko:hidden ginko:@5xl:block">
                {{ t('ginkoCms.studio.collectionListPage.localesColumn') }}
              </div>
              <div>{{ t('ginkoCms.studio.collectionListPage.statusColumn') }}</div>
              <div class="ginko:text-right">
                {{ t('ginkoCms.studio.collectionListPage.updatedColumn') }}
              </div>
            </div>
            <div
              v-for="row in enrichedRows"
              :key="row._id"
              :draggable="!isTree && canEditRow(row)"
              data-testid="cms-entry-row"
              :data-entry-slug="row.slug"
              class="ginko:group ginko:grid ginko:cursor-pointer ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-5 ginko:py-3 ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-muted/30 ginko:@3xl:items-center"
              :class="[listGridClass, dropHint?.targetId === row._id ? 'ginko:bg-primary/5' : '']"
              @click="router.push(`${contentRoute}/${collection}/${row._id}`)"
              @dragstart="startDrag(row._id)"
              @dragend="endDrag"
              @dragover.prevent="onDragOver($event, row)"
              @drop.prevent="onDrop($event, row)"
            >
              <!-- Title & path -->
              <div class="ginko:min-w-0 ginko:flex-1">
                <RouterLink
                  :to="`${contentRoute}/${collection}/${row._id}`"
                  class="ginko:block ginko:rounded-sm ginko:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring"
                >
                  <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                    {{ row.title || row.slug }}
                  </div>
                  <div
                    class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground/60"
                  >
                    {{ row.path || row.slug }}
                  </div>
                </RouterLink>
              </div>

              <!-- Languages: only when the collection actually has several -->
              <div
                v-if="hasMultipleLocales"
                class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-1 ginko:@3xl:hidden ginko:@5xl:flex"
              >
                <span
                  v-for="variant in row.localeSummaries"
                  :key="variant.locale"
                  class="ginko:rounded ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
                  :class="localeChipClasses[localeChipState(row, variant)]"
                >
                  {{ variant.locale.toUpperCase() }} ·
                  {{ localeChipLabels[localeChipState(row, variant)] }}
                </span>
              </div>

              <div>
                <StudioStatusPill :label="row.publicStateLabel" :tone="row.publicStateTone" />
              </div>

              <!-- Updated -->
              <div
                class="ginko:hidden ginko:text-right ginko:text-xs ginko:text-muted-foreground ginko:@3xl:block"
              >
                <NuxtTime
                  :datetime="row.updatedAt"
                  :locale="dateLocale"
                  month="short"
                  day="numeric"
                />
              </div>
            </div>
          </div>

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
