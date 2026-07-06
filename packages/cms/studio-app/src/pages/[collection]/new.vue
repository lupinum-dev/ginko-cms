<script setup lang="ts">
import { resolveEntryTitle } from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type {
  CmsField,
  JsonMap,
  JsonObject,
  NodeKind,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import {
  buildCmsFieldData,
  compareOrderRank,
  getClientValidationErrors,
} from '@public/utils/cmsFields'
import { AlertCircle } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import type { StudioCollectionConfig } from '../../composables/internal/types'
import { cmsPermissionKeys } from '../../composables/permissions'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioAccess } from '../../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useConvexMutation } from '../../composables/useStudioConvex'
import { useStudioDebug } from '../../composables/useStudioDebug'
import { codeDefinedCollectionDetail } from '../../lib/codeDefinedCollections'
import { slugifyStudioText } from '../../lib/slug'

const { can } = useCmsStudioAccess()
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const router = useRouter()
const route = useRoute()
const collection = computed(() => String(route.params.collection))
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const studioSettings = useCmsStudioSettings()
const defaultLocale = computed(() => studioSettings.defaultLocale.value)
const isMultiLocale = computed(() => studioSettings.locales.value.length > 1)
const defaultLocaleLabel = computed(() => {
  const locale = studioSettings.locales.value.find(
    (candidate: { code: string; label?: string }) => candidate.code === defaultLocale.value,
  )
  return locale?.label ?? defaultLocale.value
})
const showDefaultLocaleLabel = computed(
  () => defaultLocaleLabel.value.toLowerCase() !== defaultLocale.value.toLowerCase(),
)
const studioDebug = useStudioDebug('collection:new')
const form = reactive({
  slug: '',
  kind: 'page',
  parentEntryId: '',
  icon: '',
  badge: '',
})
const dataFields: Record<string, unknown> = reactive({})
const touchedFields = reactive(new Set<string>())
const stagedAssetIds = ref<string[]>([])
const submitted = ref(false)
const saving = ref(false)
const error = ref('')
const sharedSlugEditing = ref(false)
const sharedSlugManuallyEdited = ref(false)
const localizedSlugState = reactive<
  Record<string, { slug: string; editing: boolean; manuallyEdited: boolean }>
>({})
const collectionSchemaQuery = useCmsStudioQuery(
  api.ginkoCms.collections.getCollection,
  computed(() => ({ slug: collection.value })),
  {
    requiredCapability: cmsPermissionKeys.createEntries,
  },
)
const collectionConfig = computed<StudioCollectionConfig | null>(
  () =>
    (collectionSchemaQuery.data.value as StudioCollectionConfig | null | undefined) ??
    codeDefinedCollectionDetail(
      collection.value,
      cmsConfig.collections?.[collection.value],
      defaultLocale.value,
    ),
)
const isSchemaLoading = computed(
  () =>
    !collectionConfig.value &&
    collectionSchemaQuery.data.value === null &&
    collectionSchemaQuery.pending.value,
)
const isTree = computed(() => collectionConfig.value?.type === 'tree')
const isRouteBackedCollection = computed(
  () => collectionConfig.value?.mode !== 'none' && collectionConfig.value?.routing?.mode !== 'none',
)
const parentEntriesArgs = computed(() =>
  isTree.value
    ? {
        collection: collection.value,
        locale: defaultLocale.value,
      }
    : null,
)
const parentEntriesQuery = useCmsStudioQuery(api.ginkoCms.editor.listEntries, parentEntriesArgs, {
  requiredCapability: cmsPermissionKeys.createEntries,
})
studioDebug.watchQueryError('getCollection', collectionSchemaQuery, {
  collection,
})
studioDebug.watchQueryError('listEntries', parentEntriesQuery, {
  collection,
  isTree,
})
const fields = computed<CmsField[]>(() => (collectionConfig.value?.fields as CmsField[]) ?? [])
const slugField = computed(() => fields.value.find((field) => field.type === 'slug'))
const sharedFields = computed(() =>
  fields.value.filter((field) => !field.localized && field.type !== 'slug'),
)
const localizedFields = computed(() =>
  fields.value.filter((field) => field.localized && field.type !== 'slug'),
)
const slugMode = computed(
  () => collectionConfig.value?.slugMode ?? collectionConfig.value?.routing?.slugMode ?? 'shared',
)
const usesLocalizedSlug = computed(
  () => slugMode.value === 'localized' || slugMode.value === 'localizedStable',
)
const activeSlugLocale = computed(() => (usesLocalizedSlug.value ? defaultLocale.value : null))

type ParentEntry = {
  _id: string
  path: string
  parentEntryId: string | null
  order: string
  title: string
}

const existingEntries = computed<ParentEntry[]>(
  () => (parentEntriesQuery.data.value as ParentEntry[] | null | undefined) ?? [],
)

type ParentNode = ParentEntry & {
  children: ParentNode[]
}

type ParentOption = ParentEntry & {
  indent: string
}

const parentPathById = computed(() => {
  return new Map(existingEntries.value.map((entry) => [entry._id, entry.path]))
})
const parentOptions = computed<ParentOption[]>(() => {
  if (!existingEntries.value) return []
  const entries = existingEntries.value as ParentEntry[]
  const map = new Map<string, ParentNode>()
  const roots: ParentNode[] = []
  for (const entry of entries) map.set(entry._id, { ...entry, children: [] })
  for (const e of entries) {
    const node = map.get(e._id)
    if (!node) continue
    if (e.parentEntryId && map.has(e.parentEntryId)) map.get(e.parentEntryId)?.children.push(node)
    else roots.push(node)
  }
  const result: ParentOption[] = []
  const walk = (items: ParentNode[], depth: number) => {
    items.sort((a, b) => compareOrderRank(a.order, b.order))
    for (const item of items) {
      result.push({ ...item, indent: '\xA0\xA0'.repeat(depth) })
      walk(item.children, depth + 1)
    }
  }
  walk(roots, 0)
  return result
})
const slugSourceKey = computed(() => slugField.value?.slugFrom ?? null)

function ensureLocalizedSlugState(locale: string) {
  return (localizedSlugState[locale] ??= {
    slug: '',
    editing: false,
    manuallyEdited: false,
  })
}

const defaultLocalizedSlugState = computed(() => ensureLocalizedSlugState(defaultLocale.value))

function setSharedSlug(nextSlug: string, options: { manual: boolean }) {
  const slug = slugifyStudioText(nextSlug)
  if (options.manual) sharedSlugManuallyEdited.value = true
  form.slug = slug
}

function localizedSlugFor(locale: string) {
  return ensureLocalizedSlugState(locale).slug || generatedSlug.value
}

function setLocalizedSlug(locale: string, nextSlug: string, options: { manual: boolean }) {
  const state = ensureLocalizedSlugState(locale)
  state.slug = slugifyStudioText(nextSlug)
  if (options.manual) state.manuallyEdited = true
  if (locale === defaultLocale.value) form.slug = state.slug
}

// Auto-generate slug from the slugFrom source field (e.g. title → slug)
watch(
  () => (slugSourceKey.value ? dataFields[slugSourceKey.value] : null),
  (sourceValue) => {
    if (!slugSourceKey.value || typeof sourceValue !== 'string') return
    const slugFieldKey = slugField.value?.key
    if (!slugFieldKey) return
    const nextSlug = slugifyStudioText(sourceValue)

    if (usesLocalizedSlug.value) {
      const state = ensureLocalizedSlugState(defaultLocale.value)
      if (state.manuallyEdited) return
      if (!state.slug || state.slug === form.slug) {
        setLocalizedSlug(defaultLocale.value, nextSlug, { manual: false })
        dataFields[slugFieldKey] = nextSlug
      }
      return
    }

    if (sharedSlugManuallyEdited.value) return
    const currentSlug = dataFields[slugFieldKey]
    if (!currentSlug || currentSlug === form.slug) {
      setSharedSlug(nextSlug, { manual: false })
      dataFields[slugFieldKey] = form.slug
    }
  },
)
// Also sync slug dataField → form.slug for path computation
watch(
  () => (slugField.value ? dataFields[slugField.value.key] : null),
  (val) => {
    if (typeof val !== 'string') return
    if (usesLocalizedSlug.value) {
      setLocalizedSlug(defaultLocale.value, val, { manual: false })
    } else {
      setSharedSlug(val, { manual: false })
    }
  },
)
const currentTitle = computed(() =>
  resolveEntryTitle(
    dataFields as JsonMap,
    fields.value as CmsField[],
    collectionConfig.value?.settings ?? null,
  ),
)
const generatedSlug = computed(() => slugifyStudioText(currentTitle.value || ''))

watch(
  generatedSlug,
  (nextSlug) => {
    if (usesLocalizedSlug.value) {
      const state = ensureLocalizedSlugState(defaultLocale.value)
      if (state.manuallyEdited) return
      setLocalizedSlug(defaultLocale.value, nextSlug, { manual: false })
    } else {
      if (sharedSlugManuallyEdited.value) return
      setSharedSlug(nextSlug, { manual: false })
    }
    if (slugField.value) {
      dataFields[slugField.value.key] = nextSlug
    }
  },
  { immediate: true },
)

const effectiveSlug = computed(() => {
  if (usesLocalizedSlug.value) return localizedSlugFor(defaultLocale.value)
  return form.slug || generatedSlug.value
})
const computedPath = computed(() => {
  if (!isRouteBackedCollection.value) return ''
  if (!effectiveSlug.value) return ''
  const parentPath = form.parentEntryId ? parentPathById.value.get(form.parentEntryId) : null
  if (parentPath) {
    return `${parentPath.replace(/\/$/, '')}/${effectiveSlug.value}`
  }
  const prefix = collectionConfig.value?.pathPrefix?.replace(/\/$/, '') ?? `/${collection.value}`
  return `${prefix}/${effectiveSlug.value}`
})
const editorContext = computed(() => ({
  slug: effectiveSlug.value,
  ...dataFields,
}))
const assetContext = computed(() => ({
  collectionSlug: collection.value,
  locale: defaultLocale.value,
  onAssetRegistered: async (assetId: string) => {
    if (!stagedAssetIds.value.includes(assetId)) {
      stagedAssetIds.value.push(assetId)
    }
  },
}))
const { t } = useCmsI18n()
const validationErrors = computed(() =>
  getClientValidationErrors(
    fields.value,
    { ...(buildSharedData() ?? {}), ...(buildLocalizedData(dataFields) ?? {}) },
    t,
  ),
)

function shouldShowFieldValidation(fieldKey: string) {
  return submitted.value || touchedFields.has(fieldKey)
}

function markFieldTouched(fieldKey: string) {
  touchedFields.add(fieldKey)
}

function updateSharedSlug(nextSlug: string) {
  setSharedSlug(nextSlug, { manual: true })
  if (slugField.value) {
    dataFields[slugField.value.key] = form.slug
  }
}

function resetSharedSlugToTitle() {
  sharedSlugManuallyEdited.value = false
  sharedSlugEditing.value = false
  setSharedSlug(generatedSlug.value, { manual: false })
  if (slugField.value) {
    dataFields[slugField.value.key] = form.slug
  }
}

function updateLocalizedSlug(locale: string, nextSlug: string) {
  setLocalizedSlug(locale, nextSlug, { manual: true })
  if (slugField.value?.localized) {
    dataFields[slugField.value.key] = ensureLocalizedSlugState(locale).slug
  }
}

function resetLocalizedSlugToTitle(locale: string) {
  const state = ensureLocalizedSlugState(locale)
  state.manuallyEdited = false
  state.editing = false
  setLocalizedSlug(locale, generatedSlug.value, { manual: false })
  if (slugField.value?.localized) {
    dataFields[slugField.value.key] = state.slug
  }
}

async function focusFirstValidationError() {
  await nextTick()
  const firstField = validationErrors.value[0]?.field
  if (!firstField || typeof document === 'undefined') return
  const fieldId = firstField.split('.').pop() ?? firstField
  const target = document.getElementById(fieldId)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (target instanceof HTMLElement) {
    target.focus()
  }
}

function buildSharedData(): JsonObject | undefined {
  const d = (buildCmsFieldData(sharedFields.value, dataFields) ?? {}) as JsonObject
  if (slugField.value && !usesLocalizedSlug.value && !slugField.value.localized && form.slug) {
    d[slugField.value.key] = form.slug
  }
  if (isTree.value) {
    if (form.icon) d.icon = form.icon
    if (form.badge) d.badge = form.badge
  }
  return Object.keys(d).length > 0 ? d : void 0
}
function buildLocalizedData(source: Record<string, unknown>): JsonObject | undefined {
  const d = (buildCmsFieldData(localizedFields.value, source) ?? {}) as JsonObject
  if (slugField.value?.localized && activeSlugLocale.value) {
    const localizedSlug = localizedSlugFor(activeSlugLocale.value)
    if (localizedSlug) d[slugField.value.key] = localizedSlug
  }
  return Object.keys(d).length > 0 ? d : void 0
}
const createMutation = useConvexMutation(api.ginkoCms.editor.createEntry)
const attachAssetsMutation = useConvexMutation(api.ginkoCms.assets.attachAssetsToEntry)
async function handleCreate(publish = false) {
  submitted.value = true
  if (validationErrors.value.length > 0) {
    for (const fieldError of validationErrors.value) {
      touchedFields.add(fieldError.field.split('.')[0] ?? fieldError.field)
    }
    error.value =
      validationErrors.value[0]?.message ?? t('ginkoCms.studio.collectionEditor.createError')
    studioDebug.warn('create:validation', {
      collection: collection.value,
      publish,
      errors: validationErrors.value,
    })
    await focusFirstValidationError()
    return
  }
  saving.value = true
  error.value = ''
  studioDebug.debug('create:start', {
    collection: collection.value,
    publish,
    slug: effectiveSlug.value,
    path: computedPath.value,
  })
  try {
    const entryId = await createMutation({
      collection: collection.value,
      slug: effectiveSlug.value,
      locale: defaultLocale.value,
      shared: buildSharedData(),
      localized: buildLocalizedData(dataFields),
      ...(isTree.value ? { nodeKind: form.kind as NodeKind } : {}),
      ...(isTree.value && form.parentEntryId ? { parentEntryId: form.parentEntryId } : {}),
    })
    if (stagedAssetIds.value.length > 0) {
      await attachAssetsMutation({
        entryId,
        assetIds: stagedAssetIds.value,
      })
      stagedAssetIds.value = []
    }
    studioDebug.debug('create:success', { collection: collection.value, publish, entryId })
    // Per Gate -1: create-and-publish previously bypassed the preview/readiness
    // flow used by the edit route by calling publishMutation directly with
    // hard-coded expectedVersion: 1. All publish paths must run through
    // previewPublish → publishEntry. "Create & publish" now routes to the edit
    // page; the user reviews the preview and confirms publish there.
    await studioDebug.pushWithLogging(
      router,
      `${contentRoute}/${collection.value}/${entryId}`,
      'create-entry',
      { collection: collection.value, entryId, publish },
    )
  } catch (e) {
    error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.createError'))
    studioDebug.error('create:error', {
      collection: collection.value,
      publish,
      slug: effectiveSlug.value,
      path: computedPath.value,
      error: e,
    })
  } finally {
    saving.value = false
  }
}

if (typeof window !== 'undefined') {
  const keyboardSaveHandler = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !saving.value) {
      event.preventDefault()
      void handleCreate(false)
    }
  }
  window.addEventListener('keydown', keyboardSaveHandler)
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', keyboardSaveHandler)
  })
}
</script>

<template>
  <StudioEntryEditorShell>
    <template #top>
      <StudioEntryTopBar
        mode="new"
        :title="`${collectionConfig?.label ?? collection} / ${t('ginkoCms.studio.collectionEditor.newEntry')}`"
        :saving="saving"
        :can-publish="canPublishEntries"
        @create-draft="handleCreate(false)"
        @create-publish="handleCreate(true)"
      />
    </template>

    <div
      v-if="isMultiLocale"
      class="ginko:rounded-lg ginko:border ginko:border-dashed ginko:border-border/40 ginko:bg-muted/30 ginko:p-4"
    >
      <div
        class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm ginko:text-muted-foreground"
      >
        <code
          class="ginko:rounded ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
          >{{ defaultLocale.toUpperCase() }}</code
        >
        <span v-if="showDefaultLocaleLabel">{{ defaultLocaleLabel }}</span>
        <span v-if="showDefaultLocaleLabel" class="ginko:mx-1">&middot;</span>
        <span>{{ t('ginkoCms.studio.collectionEditor.translationsAfterCreate') }}</span>
      </div>
    </div>

    <div v-if="isSchemaLoading" class="ginko:space-y-5">
      <div
        class="ginko:space-y-4 ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-5"
      >
        <Skeleton
          v-for="i in 4"
          :key="`skeleton-field-${i}`"
          class="ginko:h-10 ginko:w-full ginko:rounded-md"
        />
      </div>
    </div>

    <template v-else>
      <div
        v-if="error"
        class="ginko:rounded-lg ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
      >
        <div class="ginko:flex ginko:items-center ginko:gap-2">
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ error }}
        </div>
      </div>

      <StudioSection
        title="Publishing details"
        description="Entry metadata shared by every locale."
        :badge="isRouteBackedCollection ? 'Public page' : 'Data-only'"
      >
        <div class="ginko:space-y-5">
          <div
            v-if="isRouteBackedCollection && !usesLocalizedSlug"
            class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-3"
          >
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3"
            >
              <div class="ginko:min-w-0 ginko:space-y-1">
                <div
                  class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
                >
                  Public URL
                </div>
                <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-foreground">
                  {{ computedPath || 'Add a title to generate the URL' }}
                </div>
                <div class="ginko:text-xs ginko:text-muted-foreground">
                  {{
                    sharedSlugManuallyEdited
                      ? 'Slug edited manually.'
                      : 'Slug is generated from the title.'
                  }}
                </div>
              </div>
              <div class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2">
                <Button
                  v-if="sharedSlugManuallyEdited"
                  variant="ghost"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="resetSharedSlugToTitle"
                >
                  Reset to title
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="sharedSlugEditing = !sharedSlugEditing"
                >
                  {{ sharedSlugEditing ? 'Done' : 'Edit slug' }}
                </Button>
              </div>
            </div>
            <StudioFieldShell
              v-if="sharedSlugEditing"
              for="manual-slug"
              label="URL slug"
              class="ginko:mt-3"
            >
              <Input
                id="manual-slug"
                :model-value="effectiveSlug"
                class="ginko:font-mono ginko:text-sm"
                :placeholder="generatedSlug"
                @update:model-value="updateSharedSlug(String($event ?? ''))"
              />
            </StudioFieldShell>
          </div>

          <div
            v-else-if="!isRouteBackedCollection"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:md:grid-cols-2"
          >
            <StudioFieldShell for="manual-slug" label="Entry key">
              <Input
                id="manual-slug"
                :model-value="effectiveSlug"
                class="ginko:font-mono ginko:text-sm"
                :placeholder="generatedSlug"
                @update:model-value="updateSharedSlug(String($event ?? ''))"
              />
            </StudioFieldShell>
          </div>

          <div v-if="isTree" class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:md:grid-cols-4">
            <StudioFieldShell for="kind" :label="t('ginkoCms.studio.collectionEditor.kind')">
              <Select v-model="form.kind">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page</SelectItem>
                  <SelectItem value="folder">Folder</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="section">Section</SelectItem>
                </SelectContent>
              </Select>
            </StudioFieldShell>
            <StudioFieldShell for="parent" :label="t('ginkoCms.studio.collectionEditor.parent')">
              <Select v-model="form.parentEntryId">
                <SelectTrigger>
                  <SelectValue :placeholder="t('ginkoCms.common.noneRoot')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{{ t('ginkoCms.common.noneRoot') }}</SelectItem>
                  <SelectItem v-for="e in parentOptions" :key="e._id" :value="e._id">
                    {{ e.indent }}{{ e.title || e._id }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </StudioFieldShell>
            <StudioFieldShell for="icon" :label="t('ginkoCms.studio.collectionsPage.icon')">
              <Input
                id="icon"
                v-model="form.icon"
                class="ginko:font-mono ginko:text-sm"
                :placeholder="t('ginkoCms.studio.collectionEditor.iconPlaceholder')"
              />
            </StudioFieldShell>
            <StudioFieldShell for="badge" :label="t('ginkoCms.studio.collectionEditor.badge')">
              <Input
                id="badge"
                v-model="form.badge"
                :placeholder="t('ginkoCms.studio.collectionEditor.badgePlaceholder')"
              />
            </StudioFieldShell>
          </div>

          <div
            v-if="sharedFields.length > 0"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:md:grid-cols-2"
          >
            <StudioFieldRenderer
              v-for="field in sharedFields"
              :key="field.key"
              :field="field"
              :model-value="dataFields[field.key]"
              :context="editorContext"
              :locale="defaultLocale"
              :asset-context="assetContext"
              :show-validation="shouldShowFieldValidation(field.key)"
              @focusout="markFieldTouched(field.key)"
              @update:model-value="dataFields[field.key] = $event"
            />
          </div>
        </div>
      </StudioSection>

      <section
        class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
      >
        <div
          class="ginko:flex ginko:items-center ginko:gap-3 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-5 ginko:py-3"
        >
          <span
            class="ginko:font-mono ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground"
          >
            {{ defaultLocale.toUpperCase() }}
          </span>
          <div v-if="showDefaultLocaleLabel" class="ginko:font-medium">
            {{ defaultLocaleLabel }}
          </div>
          <StudioStatusPill label="Draft setup" tone="neutral" />
        </div>
        <div class="ginko:bg-card ginko:p-5">
          <div
            v-if="isRouteBackedCollection && usesLocalizedSlug"
            class="ginko:mb-5 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-3"
          >
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3"
            >
              <div class="ginko:min-w-0 ginko:space-y-1">
                <div
                  class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
                >
                  Public URL
                </div>
                <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-foreground">
                  {{ computedPath || 'Add a title to generate the URL' }}
                </div>
                <div class="ginko:text-xs ginko:text-muted-foreground">
                  {{
                    defaultLocalizedSlugState.manuallyEdited
                      ? 'Slug edited manually for this locale.'
                      : 'Slug is generated from this locale title.'
                  }}
                </div>
              </div>
              <div class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2">
                <Button
                  v-if="defaultLocalizedSlugState.manuallyEdited"
                  variant="ghost"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="resetLocalizedSlugToTitle(defaultLocale)"
                >
                  Reset to title
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="defaultLocalizedSlugState.editing = !defaultLocalizedSlugState.editing"
                >
                  {{ defaultLocalizedSlugState.editing ? 'Done' : 'Edit slug' }}
                </Button>
              </div>
            </div>
            <StudioFieldShell
              v-if="defaultLocalizedSlugState.editing"
              for="manual-slug"
              label="URL slug"
              class="ginko:mt-3"
            >
              <Input
                id="manual-slug"
                :model-value="localizedSlugFor(defaultLocale)"
                class="ginko:font-mono ginko:text-sm"
                :placeholder="generatedSlug"
                @update:model-value="updateLocalizedSlug(defaultLocale, String($event ?? ''))"
              />
            </StudioFieldShell>
          </div>

          <div v-if="localizedFields.length > 0" class="ginko:grid ginko:grid-cols-1 ginko:gap-4">
            <StudioFieldRenderer
              v-for="field in localizedFields"
              :key="field.key"
              :field="field"
              :model-value="dataFields[field.key]"
              :context="editorContext"
              :locale="defaultLocale"
              :asset-context="assetContext"
              :show-validation="shouldShowFieldValidation(field.key)"
              @focusout="markFieldTouched(field.key)"
              @update:model-value="dataFields[field.key] = $event"
            />
          </div>
        </div>
      </section>
    </template>

    <template #rail>
      <div>
        <StudioInspectorSection title="Draft setup">
          <p class="ginko:mt-3 ginko:text-sm ginko:text-muted-foreground">
            Create the entry first. Translation, route status, versions, and workflow details become
            available afterwards.
          </p>
        </StudioInspectorSection>
        <StudioInspectorSection title="Route preview">
          <div
            class="ginko:mt-3 ginko:truncate ginko:font-mono ginko:text-sm ginko:text-muted-foreground"
          >
            {{ computedPath || 'No route yet' }}
          </div>
        </StudioInspectorSection>
      </div>
    </template>
  </StudioEntryEditorShell>
</template>
