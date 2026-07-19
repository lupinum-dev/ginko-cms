<script setup lang="ts">
import {
  resolveDescriptionFieldKey,
  resolveEntryTitle,
  resolveTitleFieldKey,
} from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type {
  CmsField,
  JsonMap,
  JsonObject,
  NodeKind,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { buildCmsFieldData, getClientValidationErrors } from '@public/utils/cmsFields'
import type { FunctionArgs } from 'convex/server'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import StudioEntryCreatePanel from '../../components/studio/editor/StudioEntryCreatePanel.vue'
import StudioEntryHeroFields from '../../components/studio/editor/StudioEntryHeroFields.vue'
import StudioEntryParentPicker from '../../components/studio/editor/StudioEntryParentPicker.vue'
import type { StudioCollectionConfig } from '../../composables/internal/types'
import { cmsPermissionKeys } from '../../composables/permissions'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsContractCompatibility } from '../../composables/useCmsContractCompatibility'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioAccess } from '../../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useRightSidebarPanel } from '../../composables/useRightSidebar'
import { useConvexMutation } from '../../composables/useStudioConvex'
import { useStudioDebug } from '../../composables/useStudioDebug'
import { slugifyStudioText } from '../../lib/slug'

const { can } = useCmsStudioAccess()
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const router = useRouter()
const route = useRoute()
const collection = computed(() => String(route.params.collection))
const cmsConfig = useCmsConfig()
const contract = useCmsContractCompatibility()
const contractWritable = computed(() => contract.compatibility.value?.writable === true)
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
  () => (collectionSchemaQuery.data.value as StudioCollectionConfig | null | undefined) ?? null,
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
studioDebug.watchQueryError('getCollection', collectionSchemaQuery, {
  collection,
})
const fields = computed<CmsField[]>(() => (collectionConfig.value?.fields as CmsField[]) ?? [])
const slugField = computed(() => fields.value.find((field) => field.type === 'slug'))
const sharedFields = computed(() =>
  fields.value.filter((field) => !field.localized && field.type !== 'slug'),
)
const localizedFields = computed(() =>
  fields.value.filter((field) => field.localized && field.type !== 'slug'),
)
// Writing-surface hero (mirrors useEntryLoader's display-only split): the
// title/description render as a large borderless heading, the generic loops
// below render the remaining detail fields. buildSharedData/buildLocalizedData
// keep reading the FULL field lists, so payloads are unaffected.
function heroEligible(field: CmsField | null | undefined): field is CmsField {
  return (
    !!field &&
    (field.type === 'text' || field.type === 'textarea') &&
    !field.hidden &&
    !field.condition
  )
}
const heroTitleField = computed<CmsField | null>(() => {
  const key = resolveTitleFieldKey(fields.value, collectionConfig.value?.settings)
  const field = key ? fields.value.find((candidate) => candidate.key === key) : null
  return heroEligible(field) ? field : null
})
const heroDescriptionField = computed<CmsField | null>(() => {
  if (!heroTitleField.value) return null
  const key = resolveDescriptionFieldKey(fields.value, collectionConfig.value?.settings)
  const field = key ? fields.value.find((candidate) => candidate.key === key) : null
  return heroEligible(field) &&
    field.key !== heroTitleField.value.key &&
    Boolean(field.localized) === Boolean(heroTitleField.value.localized)
    ? field
    : null
})
const heroFieldKeys = computed(() => {
  const keys = new Set<string>()
  if (heroTitleField.value) keys.add(heroTitleField.value.key)
  if (heroDescriptionField.value) keys.add(heroDescriptionField.value.key)
  return keys
})
const sharedDetailFields = computed(() =>
  sharedFields.value.filter((field) => !heroFieldKeys.value.has(field.key)),
)
const localizedDetailFields = computed(() =>
  localizedFields.value.filter((field) => !heroFieldKeys.value.has(field.key)),
)
const sharedHeroTitleField = computed(() =>
  heroTitleField.value && !heroTitleField.value.localized ? heroTitleField.value : null,
)
const localizedHeroTitleField = computed(() =>
  heroTitleField.value?.localized ? heroTitleField.value : null,
)
const slugMode = computed(
  () => collectionConfig.value?.slugMode ?? collectionConfig.value?.routing?.slugMode ?? 'shared',
)
const usesLocalizedSlug = computed(
  () => slugMode.value === 'localized' || slugMode.value === 'localizedStable',
)
const activeSlugLocale = computed(() => (usesLocalizedSlug.value ? defaultLocale.value : null))

const parentPathById = ref(new Map<string, string>())
function recordParentSelection(value: { id: string; path: string } | null) {
  if (!value) return
  parentPathById.value = new Map(parentPathById.value).set(value.id, value.path)
}
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

// Right-sidebar panel: draft-setup guidance + live route preview (Phase L;
// replaces the dead #rail templates removed with the editor shell's rail).
useRightSidebarPanel({
  title: () => t('ginkoCms.studio.collectionEditor.newEntry'),
  description: () => {
    const label = collectionConfig.value?.label
    return typeof label === 'string' ? label : String(collection.value)
  },
  component: StudioEntryCreatePanel,
  props: () => ({ computedPath: computedPath.value }),
  defaultOpen: false,
  compact: true,
})
const editorContext = computed(() => ({
  slug: effectiveSlug.value,
  ...dataFields,
}))
const assetContext = computed(() => ({
  collection: collection.value,
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

// Rich-text content is stored on the draft row's bodyMdc column, never inside
// the shared/localized value maps (mirrors useEntryDraft's save path). It is
// therefore excluded here and sent as the dedicated `bodyMdc` create argument.
function withoutRichtext(list: CmsField[]): CmsField[] {
  return list.filter((field) => field.type !== 'richtext')
}
function buildBodyMdc(): string | undefined {
  const richtextField = fields.value.find((field) => field.type === 'richtext')
  if (!richtextField) return void 0
  const value = dataFields[richtextField.key]
  return typeof value === 'string' && value.length > 0 ? value : void 0
}
function buildSharedData(): JsonObject | undefined {
  const d = (buildCmsFieldData(withoutRichtext(sharedFields.value), dataFields) ?? {}) as JsonObject
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
  const d = (buildCmsFieldData(withoutRichtext(localizedFields.value), source) ?? {}) as JsonObject
  if (slugField.value?.localized && activeSlugLocale.value) {
    const localizedSlug = localizedSlugFor(activeSlugLocale.value)
    if (localizedSlug) d[slugField.value.key] = localizedSlug
  }
  return Object.keys(d).length > 0 ? d : void 0
}
const createMutation = useConvexMutation(api.ginkoCms.editor.createEntry)
const attachAssetsMutation = useConvexMutation(api.ginkoCms.assets.attachAssetsToEntry)
async function handleCreate(publish = false) {
  if (!contractWritable.value) return
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
      shared: buildSharedData() as FunctionArgs<typeof api.ginkoCms.editor.createEntry>['shared'],
      localized: buildLocalizedData(dataFields) as FunctionArgs<
        typeof api.ginkoCms.editor.createEntry
      >['localized'],
      bodyMdc: buildBodyMdc(),
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
        :saving="saving || !contractWritable"
        :can-publish="canPublishEntries"
        @create-draft="handleCreate(false)"
        @create-publish="handleCreate(true)"
      />
    </template>

    <StudioNotice v-if="isMultiLocale" tone="info">
      <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
        <code
          class="ginko:rounded ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:font-mono ginko:text-xs"
          >{{ defaultLocale.toUpperCase() }}</code
        >
        <span v-if="showDefaultLocaleLabel">{{ defaultLocaleLabel }}</span>
        <span v-if="showDefaultLocaleLabel" class="ginko:mx-1">&middot;</span>
        <span>{{ t('ginkoCms.studio.collectionEditor.translationsAfterCreate') }}</span>
      </div>
    </StudioNotice>

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
      <StudioNotice v-if="error" tone="danger" :description="error" />

      <StudioSection
        title="Publishing details"
        description="Entry details shared by every language."
        :badge="isRouteBackedCollection ? 'Website page' : 'Shared data'"
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
                <div class="studio-text-eyebrow ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.collectionEditor.liveUrl') }}
                </div>
                <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-foreground">
                  {{ computedPath || t('ginkoCms.studio.collectionEditor.urlNeedsTitle') }}
                </div>
                <div class="studio-text-caption ginko:text-muted-foreground">
                  {{
                    sharedSlugManuallyEdited
                      ? t('ginkoCms.studio.collectionEditor.sharedSlugManual')
                      : t('ginkoCms.studio.collectionEditor.sharedSlugAuto')
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
                  {{ t('ginkoCms.studio.collectionEditor.resetToTitle') }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="sharedSlugEditing = !sharedSlugEditing"
                >
                  {{
                    sharedSlugEditing
                      ? t('ginkoCms.studio.collectionEditor.slugDone')
                      : t('ginkoCms.studio.collectionEditor.editSlug')
                  }}
                </Button>
              </div>
            </div>
            <StudioFieldShell
              v-if="sharedSlugEditing"
              for="manual-slug"
              :label="t('ginkoCms.studio.collectionEditor.urlSlugLabel')"
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
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-2"
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

          <div
            v-if="isTree"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-4"
          >
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
              <StudioEntryParentPicker
                v-model="form.parentEntryId"
                :collection="collection"
                :locale="defaultLocale"
                @select="recordParentSelection"
              />
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

          <!-- Shared hero (single-language sites): the title writes the same
               dataFields the slug watchers read, so URL generation is
               untouched; the loop below renders the remaining detail fields. -->
          <StudioEntryHeroFields
            v-if="sharedHeroTitleField"
            :title-field="sharedHeroTitleField"
            :description-field="heroDescriptionField"
            :values="dataFields"
            :show-validation="shouldShowFieldValidation(sharedHeroTitleField.key)"
            @update="(key, value) => (dataFields[key] = value)"
            @blur="markFieldTouched"
          />
          <div
            v-if="sharedDetailFields.length > 0"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4 ginko:@3xl:grid-cols-2"
          >
            <StudioFieldRenderer
              v-for="field in sharedDetailFields"
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
            class="studio-text-caption ginko:font-mono ginko:font-semibold ginko:uppercase ginko:text-muted-foreground"
          >
            {{ defaultLocale.toUpperCase() }}
          </span>
          <div v-if="showDefaultLocaleLabel" class="studio-text-label ginko:text-foreground">
            {{ defaultLocaleLabel }}
          </div>
          <StudioStatusPill label="Draft setup" tone="neutral" />
        </div>
        <div class="ginko:bg-card ginko:p-5">
          <StudioEntryHeroFields
            v-if="localizedHeroTitleField"
            :title-field="localizedHeroTitleField"
            :description-field="heroDescriptionField"
            :values="dataFields"
            :show-validation="shouldShowFieldValidation(localizedHeroTitleField.key)"
            class="ginko:mb-5"
            @update="(key, value) => (dataFields[key] = value)"
            @blur="markFieldTouched"
          />
          <div
            v-if="isRouteBackedCollection && usesLocalizedSlug"
            class="ginko:mb-5 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-3"
          >
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3"
            >
              <div class="ginko:min-w-0 ginko:space-y-1">
                <div class="studio-text-eyebrow ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.collectionEditor.liveUrl') }}
                </div>
                <div class="ginko:truncate ginko:font-mono ginko:text-sm ginko:text-foreground">
                  {{ computedPath || t('ginkoCms.studio.collectionEditor.urlNeedsTitle') }}
                </div>
                <div class="studio-text-caption ginko:text-muted-foreground">
                  {{
                    defaultLocalizedSlugState.manuallyEdited
                      ? t('ginkoCms.studio.collectionEditor.localizedSlugManual')
                      : t('ginkoCms.studio.collectionEditor.localizedSlugAuto')
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
                  {{ t('ginkoCms.studio.collectionEditor.resetToTitle') }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="ginko:h-8"
                  type="button"
                  @click="defaultLocalizedSlugState.editing = !defaultLocalizedSlugState.editing"
                >
                  {{
                    defaultLocalizedSlugState.editing
                      ? t('ginkoCms.studio.collectionEditor.slugDone')
                      : t('ginkoCms.studio.collectionEditor.editSlug')
                  }}
                </Button>
              </div>
            </div>
            <StudioFieldShell
              v-if="defaultLocalizedSlugState.editing"
              for="manual-slug"
              :label="t('ginkoCms.studio.collectionEditor.urlSlugLabel')"
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

          <div
            v-if="localizedDetailFields.length > 0"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-4"
          >
            <StudioFieldRenderer
              v-for="field in localizedDetailFields"
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
  </StudioEntryEditorShell>
</template>
