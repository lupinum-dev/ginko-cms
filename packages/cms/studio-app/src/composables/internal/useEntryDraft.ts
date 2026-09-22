import type { JsonObject, NodeKind } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  EntryDraftSession,
  entryDraftSnapshot,
  validateDraftSaveRequest,
} from '@public/editing/index'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { buildCmsFieldData } from '@public/utils/cmsFields'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { z } from 'zod'

import { api } from '../../boundary/api'
import { getStudioAuthoringSource } from '../../boundary/host-bridge'
import { useConvexMutation } from '../useStudioConvex'
import type { useStudioDebug } from '../useStudioDebug'
import type { StudioRichtextFlush } from './studioRichtextFlush'
import type { StudioCollectionConfig, StudioEntry, StudioField } from './types'

interface EntryDraftDeps {
  entry: Ref<StudioEntry | null>
  collection: Ref<string>
  entryId: Ref<string>
  contentRoute: string
  collectionConfig: Ref<StudioCollectionConfig | null>
  isTree: Ref<boolean>
  fields: Ref<StudioField[]>
  sharedFields: Ref<StudioField[]>
  localizedFields: Ref<StudioField[]>
  currentLocale: Ref<string>
  parentPathById: Ref<Map<string, string>>
  canEditEntries: Ref<boolean>
  studioDebug: ReturnType<typeof useStudioDebug>
  t: (key: string) => string
  initialized: Ref<boolean>
  refreshEntry: () => Promise<void>
  richtextFlush: StudioRichtextFlush
}

export function useEntryDraft(deps: EntryDraftDeps) {
  const {
    entry,
    collection,
    entryId,
    collectionConfig,
    isTree,
    fields,
    localizedFields,
    currentLocale,
    parentPathById,
    canEditEntries,
    t,
    initialized,
    richtextFlush,
  } = deps
  const form = reactive({ slug: '', kind: 'page', parentEntryId: '', icon: '', badge: '' })
  const dataFields = reactive<Record<string, unknown>>({})
  const error = ref('')
  // Operation dialogs also use this flag while preparing a publish or locale change.
  const operationSaving = ref(false)
  const mutation = useConvexMutation(api.ginkoCms.editor.saveEntryDraft)
  let hydrating = false
  const identity = () => `${entryId.value}:${currentLocale.value}`
  let activeIdentity = identity()

  const createSession = () =>
    reactive(
      new EntryDraftSession({
        entryId: entryId.value,
        canEdit: () => canEditEntries.value,
        hasPendingEditors: () => richtextFlush.hasPending.value,
        flushEditors: async () => {
          const result = await richtextFlush.flush()
          await nextTick()
          if (!result.ok) error.value = result.error.message
          return result.ok
        },
        save: (request) => {
          validateDraftSaveRequest(request)
          return mutation(request)
        },
      }),
    )
  const session = ref(createSession())
  const isDirty = computed(() => session.value.hasPendingWork)
  const saving = computed({
    get: () => operationSaving.value || session.value.saving,
    set: (value) => {
      operationSaving.value = value
    },
  })
  const saveState = computed(() => session.value.state)
  const saveConflict = computed(() => session.value.conflicts.length > 0)
  const conflicts = computed(() => session.value.conflicts)
  const offlineSavePending = computed(() => session.value.hasUnconfirmedSave)
  const lastHydratedVersion = computed(() =>
    session.value.initialized ? session.value.version : null,
  )
  const lastSaved = computed(() =>
    session.value.lastSaved ? new Date(session.value.lastSaved) : null,
  )

  const localizedSlug = computed(() =>
    ['localized', 'localizedStable'].includes(
      collectionConfig.value?.slugMode ?? collectionConfig.value?.routing?.slugMode ?? 'shared',
    ),
  )
  const computedPath = computed(() => {
    if (
      collectionConfig.value?.mode === 'none' ||
      collectionConfig.value?.routing?.mode === 'none' ||
      !form.slug
    )
      return ''
    const parent = form.parentEntryId ? parentPathById.value.get(form.parentEntryId) : null
    const prefix =
      parent ??
      collectionConfig.value?.routing?.pathPrefix ??
      collectionConfig.value?.pathPrefix ??
      `/${collection.value}`
    return `${prefix.replace(/\/$/, '')}/${form.slug}`
  })
  const editorContext = computed(() => ({ slug: form.slug, ...dataFields }))
  const assetContext = computed(() => ({
    collection: collection.value,
    locale: currentLocale.value,
    entryId: entryId.value,
    authoringSource: getStudioAuthoringSource(collection.value, collectionConfig.value),
  }))

  function hydrateFields() {
    const patch = session.value.patch
    const locale = patch.locales?.[currentLocale.value]
    hydrating = true
    form.slug = (localizedSlug.value ? locale?.slug : patch.shared?.slug) ?? entry.value?.slug ?? ''
    form.kind = patch.shared?.nodeKind ?? 'page'
    form.parentEntryId = patch.shared?.parentEntryId ?? ''
    form.icon = typeof patch.shared?.shared?.icon === 'string' ? patch.shared.shared.icon : ''
    form.badge = typeof patch.shared?.shared?.badge === 'string' ? patch.shared.shared.badge : ''
    for (const key of Object.keys(dataFields))
      if (!fields.value.some((field) => field.key === key)) Reflect.deleteProperty(dataFields, key)
    for (const field of fields.value) {
      dataFields[field.key] =
        field.type === 'richtext'
          ? (locale?.bodyMdc ?? '')
          : ((field.localized ? locale?.values : patch.shared?.shared)?.[field.key] ?? '')
    }
    hydrating = false
  }

  watch(
    [entry, collectionConfig],
    ([value, config]) => {
      if (!value || !config || value._id !== entryId.value || value.locale !== currentLocale.value)
        return
      if (activeIdentity !== identity()) {
        session.value.dispose()
        session.value = createSession()
        activeIdentity = identity()
      }
      session.value.receive(entryDraftSnapshot(value))
      hydrateFields()
      initialized.value = true
    },
    { immediate: true },
  )

  // Deferred query results can be accepted by an autosave acknowledgement,
  // without another query notification. Keep the form on that accepted state.
  watch(
    () => session.value.patch,
    () => hydrateFields(),
  )

  // Only changed form values become intent. Untouched empty/default display
  // values must not replace absent stored fields or another editor's update.
  watch(
    () => JSON.stringify(dataFields),
    (next, previous) => {
      if (
        hydrating ||
        !initialized.value ||
        activeIdentity !== identity() ||
        !canEditEntries.value ||
        previous === undefined
      )
        return
      const before = JSON.parse(previous) as Record<string, unknown>
      const patch = session.value.patch
      const locale = patch.locales?.[currentLocale.value]
      for (const field of fields.value) {
        if (JSON.stringify(before[field.key]) === JSON.stringify(dataFields[field.key])) continue
        if (field.type === 'richtext') {
          const body = dataFields[field.key]
          if (locale) locale.bodyMdc = typeof body === 'string' ? body : ''
          continue
        }
        const target = field.localized ? locale?.values : patch.shared?.shared
        if (!target) continue
        const validated = z
          .record(z.string(), z.json())
          .parse(buildCmsFieldData([field], dataFields) ?? {})
        if (Object.hasOwn(validated, field.key)) target[field.key] = validated[field.key]!
        else Reflect.deleteProperty(target, field.key)
      }
      session.value.edit(patch)
    },
    { flush: 'sync' },
  )

  watch(
    () => ({ ...form }),
    (next, previous) => {
      if (hydrating || !initialized.value || activeIdentity !== identity() || !canEditEntries.value)
        return
      const patch = session.value.patch
      if (next.slug !== previous.slug) {
        const target = localizedSlug.value ? patch.locales?.[currentLocale.value] : patch.shared
        if (target) target.slug = next.slug || null
      }
      if (patch.shared && isTree.value) {
        if (next.kind !== previous.kind) patch.shared.nodeKind = next.kind as NodeKind
        if (next.parentEntryId !== previous.parentEntryId)
          patch.shared.parentEntryId = next.parentEntryId || null
        for (const field of ['icon', 'badge'] as const) {
          if (next[field] === previous[field] || !patch.shared.shared) continue
          if (next[field]) patch.shared.shared[field] = next[field]
          else Reflect.deleteProperty(patch.shared.shared, field)
        }
      }
      session.value.edit(patch)
    },
    { flush: 'sync' },
  )

  watch(
    () => session.value.error,
    (cause) => {
      error.value = cause
        ? getCmsErrorMessage(cause, t('ginkoCms.studio.collectionEditor.saveDraftError'))
        : ''
    },
  )

  async function handleSaveDraft(_silent = false) {
    const result = await session.value.flush()
    hydrateFields()
    return result
  }
  function requestHydrate() {
    if (
      entry.value &&
      entry.value._id === entryId.value &&
      entry.value.locale === currentLocale.value
    )
      session.value.receive(entryDraftSnapshot(entry.value))
    hydrateFields()
  }
  function resolveConflict(path: string[], choice: 'mine' | 'shared') {
    session.value.resolve(path, choice)
    hydrateFields()
  }
  function buildSharedData(): JsonObject | undefined {
    return session.value.patch.shared?.shared
  }
  function buildLocalizedData(source: Record<string, unknown>) {
    return buildCmsFieldData(
      localizedFields.value.filter((field) => field.type !== 'richtext'),
      source,
    )
  }
  const cancelAutoSave = () => session.value.cancelAutoSave()
  const retryOfflineSave = () => handleSaveDraft(true)
  const guard = async () => !session.value.hasPendingWork || (await handleSaveDraft(true))
  onBeforeRouteLeave(guard)
  onBeforeRouteUpdate(guard)

  if (typeof window !== 'undefined') {
    const unload = (event: BeforeUnloadEvent) => {
      if (session.value.hasPendingWork) event.preventDefault()
    }
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSaveDraft()
      }
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('keydown', keydown)
    window.addEventListener('online', retryOfflineSave)
    onBeforeUnmount(() => {
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('online', retryOfflineSave)
    })
  }
  onBeforeUnmount(() => session.value.dispose())
  return {
    isDirty,
    saving,
    saveState,
    error,
    offlineSavePending,
    saveConflict,
    conflicts,
    resolveConflict,
    lastHydratedVersion,
    lastSaved,
    form,
    dataFields,
    computedPath,
    editorContext,
    assetContext,
    handleSaveDraft,
    buildSharedData,
    buildLocalizedData,
    cancelAutoSave,
    requestHydrate,
    retryOfflineSave,
  }
}
