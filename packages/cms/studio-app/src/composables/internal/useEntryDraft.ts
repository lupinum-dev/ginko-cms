import type { JsonObject, NodeKind } from '@lupinum/ginko-cms-contract/shared/types.js'
import { isEqualJsonValue } from '@lupinum/ginko-cms-contract/shared/utils.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { buildCmsFieldData } from '@public/utils/cmsFields'
import type { FunctionArgs } from 'convex/server'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { api } from '../../boundary/api'
import { useConvexMutation } from '../useStudioConvex'
import type { useStudioDebug } from '../useStudioDebug'
import { isConcurrentEditError, isTransientSaveError, OfflineSaveRetry } from './autosaveRecovery'
import { SaveQueue } from './saveQueue'
import type { StudioCollectionConfig, StudioEntry, StudioField } from './types'
import { studioConfirm } from './useStudioConfirm'

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
}

export function useEntryDraft(deps: EntryDraftDeps) {
  const {
    entry,
    collection,
    entryId,
    collectionConfig,
    isTree,
    fields,
    sharedFields,
    localizedFields,
    currentLocale,
    parentPathById,
    canEditEntries,
    studioDebug,
    t,
    initialized,
    refreshEntry,
  } = deps

  const isDirty = ref(false)
  const saving = ref(false)
  const error = ref('')
  const offlineSavePending = ref(false)
  const saveConflict = ref(false)
  const lastSaved = ref<Date | null>(null)
  const hydrating = ref(false)
  const editSerial = ref(0)
  const lastPersistedEditSerial = ref(0)

  const saveState = computed<'saving' | 'saved' | 'dirty' | 'conflict' | 'offline-pending'>(() => {
    if (saveConflict.value) return 'conflict'
    if (offlineSavePending.value) return 'offline-pending'
    if (saving.value || saveQueue.active) return 'saving'
    if (isDirty.value) return 'dirty'
    return 'saved'
  })

  const form = reactive({
    slug: '',
    kind: 'page',
    parentEntryId: '',
    icon: '',
    badge: '',
  })
  const dataFields = reactive<Record<string, unknown>>({})

  const computedPath = computed(() => {
    if (
      collectionConfig.value?.mode === 'none' ||
      collectionConfig.value?.routing?.mode === 'none'
    ) {
      return ''
    }
    if (!form.slug) return ''
    const parentPath = form.parentEntryId ? parentPathById.value.get(form.parentEntryId) : null
    if (parentPath) {
      return `${String(parentPath).replace(/\/$/, '')}/${form.slug}`
    }
    const prefix = collectionConfig.value?.pathPrefix?.replace(/\/$/, '') ?? `/${collection.value}`
    return `${prefix}/${form.slug}`
  })

  const editorContext = computed(() => ({
    slug: form.slug,
    ...dataFields,
  }))

  const assetContext = computed(() => ({
    collectionSlug: collection.value,
    locale: currentLocale.value,
    entryId: entryId.value,
  }))

  // --- Hydrate form from entry data ---
  // The draft version this form's content is based on. Unlike
  // `entry.draftVersion` (a live query that advances when ANY session saves),
  // this only moves on hydrate or our own successful save, so it is the
  // correct optimistic-concurrency token for saves.
  const lastHydratedVersion = ref<number | null>(null)

  function isDraftStale() {
    return (
      lastHydratedVersion.value != null &&
      entry.value != null &&
      entry.value.draftVersion !== lastHydratedVersion.value
    )
  }

  function readBodyMdc(value: StudioEntry): string {
    return typeof value.localeData?.draft?.bodyMdc === 'string'
      ? value.localeData.draft.bodyMdc
      : ''
  }

  function localizedValueFields() {
    return localizedFields.value.filter((field) => field.type !== 'richtext')
  }

  function hydrateForm(value: StudioEntry, reason: string) {
    hydrating.value = true
    const data =
      typeof value.data === 'object' && value.data !== null
        ? (value.data as Record<string, unknown>)
        : {}
    studioDebug.debug(`entry:hydrate:${reason}`, {
      collection: collection.value,
      entryId: entryId.value,
      status: value.status,
      slug: value.slug,
      draftVersion: value.draftVersion,
      dataKeys: Object.keys(data),
    })
    form.slug = value.slug
    form.parentEntryId = value.parentEntryId ?? ''
    form.kind = value.nodeKind ?? 'page'
    form.icon = typeof data.icon === 'string' ? data.icon : ''
    form.badge = typeof data.badge === 'string' ? data.badge : ''
    for (const field of fields.value) {
      dataFields[field.key] =
        field.type === 'richtext' ? readBodyMdc(value) : (data[field.key] ?? '')
    }
    isDirty.value = false
    saveConflict.value = false
    lastPersistedEditSerial.value = editSerial.value
    lastHydratedVersion.value = value.draftVersion
    queueMicrotask(() => {
      hydrating.value = false
    })
  }

  // Initial load
  watch(
    entry,
    (value) => {
      if (value && !initialized.value) {
        hydrateForm(value, 'loaded')
        queueMicrotask(() => {
          initialized.value = true
        })
      }
    },
    { immediate: true },
  )

  // Re-hydrate when entry data changes after a restore/rollback/undo/revert.
  // Called explicitly by the history composable after a successful mutation.
  let pendingHydrate = false
  function requestHydrate() {
    cancelAutoSave()
    studioDebug.debug('entry:requestHydrate', {
      collection: collection.value,
      entryId: entryId.value,
      currentDraftVersion: entry.value?.draftVersion ?? null,
      lastHydratedVersion: lastHydratedVersion.value,
    })
    // Save-conflict recovery: the live entry is already ahead of this form
    // (the draftVersion watcher fired and will not fire again), so hydrate
    // now instead of waiting for a version change that already happened.
    if (initialized.value && entry.value && isDraftStale()) {
      hydrateForm(entry.value, 'externalChange')
      return
    }
    pendingHydrate = true
  }
  watch(
    () => entry.value?.draftVersion,
    (nextVersion, prevVersion) => {
      studioDebug.debug('entry:draftVersionChanged', {
        collection: collection.value,
        entryId: entryId.value,
        prevVersion: prevVersion ?? null,
        nextVersion: nextVersion ?? null,
        pendingHydrate,
        initialized: initialized.value,
        hasEntry: !!entry.value,
      })
      if (!initialized.value || !entry.value || nextVersion == null) return
      if (pendingHydrate) {
        pendingHydrate = false
        hydrateForm(entry.value, 'externalChange')
        return
      }
      // Another session saved a newer draft (our own saves update
      // lastHydratedVersion before the live query advances).
      if (nextVersion === lastHydratedVersion.value || saveQueue.active || saving.value) return
      if (isDirty.value) {
        // Local unsaved edits would overwrite the newer draft: block instead.
        cancelAutoSave()
        saveConflict.value = true
        return
      }
      hydrateForm(entry.value, 'externalChange')
    },
  )

  // --- Dirty tracking ---
  watch([() => ({ ...form }), () => ({ ...dataFields })], () => {
    if (!initialized.value || hydrating.value) return
    editSerial.value += 1
    isDirty.value = true
    if (!isDraftStale()) saveConflict.value = false
    scheduleAutoSave()
  })

  // --- Unsaved changes guards ---
  onBeforeRouteLeave((_to, _from, next) => {
    if (isDirty.value && !saving.value && canEditEntries.value) {
      void studioConfirm({
        title: 'Leave with unsaved changes?',
        description: t('ginkoCms.studio.collectionEditor.unsavedChanges'),
        confirmLabel: 'Leave page',
        confirmVariant: 'destructive',
      }).then((answer) => {
        next(answer ? undefined : false)
      })
      return
    }
    next()
  })

  const offlineRetry = new OfflineSaveRetry()

  async function retryOfflineSave() {
    if (!offlineRetry.hasPendingRetry || !isDirty.value || !canEditEntries.value) return false
    const succeeded = await offlineRetry.retry(() => handleSaveDraft(true))
    offlineSavePending.value = offlineRetry.hasPendingRetry
    return succeeded
  }

  if (typeof window !== 'undefined') {
    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (isDirty.value) {
        event.preventDefault()
      }
    }
    const keyboardSaveHandler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 's' &&
        canEditEntries.value
      ) {
        event.preventDefault()
        void handleSaveDraft()
      }
    }
    window.addEventListener('beforeunload', beforeUnloadHandler)
    window.addEventListener('keydown', keyboardSaveHandler)
    window.addEventListener('online', retryOfflineSave)
    onBeforeUnmount(() => {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
      window.removeEventListener('keydown', keyboardSaveHandler)
      window.removeEventListener('online', retryOfflineSave)
    })
  }

  // --- Data builders ---
  function buildSharedData() {
    const data: Record<string, unknown> = buildCmsFieldData(sharedFields.value, dataFields) ?? {}
    if (isTree.value) {
      if (form.icon) data.icon = form.icon
      if (form.badge) data.badge = form.badge
    }
    return Object.keys(data).length > 0 ? data : undefined
  }

  function buildLocalizedData(source: Record<string, unknown>) {
    return buildCmsFieldData(localizedValueFields(), source)
  }

  function buildBodyMdc(source: Record<string, unknown>) {
    const richtextField = localizedFields.value.find((field) => field.type === 'richtext')
    if (!richtextField) return undefined
    const value = source[richtextField.key]
    return typeof value === 'string' ? value : ''
  }

  // --- Mutations ---
  const saveEntryDraftMutation = useConvexMutation(api.ginkoCms.editor.saveEntryDraft)

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  function cancelAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  function scheduleAutoSave() {
    if (!initialized.value || hydrating.value || !isDirty.value || !canEditEntries.value) return
    if (saveConflict.value) return
    cancelAutoSave()
    autoSaveTimer = setTimeout(() => {
      void handleSaveDraft(true)
    }, 3000)
  }

  const saveQueue = new SaveQueue(async (runSilent) => {
    error.value = ''
    saveConflict.value = false
    const currentEntry = entry.value
    if (!currentEntry) return false
    if (isDraftStale()) {
      // A newer draft exists on the server; refuse to overwrite it.
      cancelAutoSave()
      saveConflict.value = true
      studioDebug.debug('saveDraft:staleBlocked', {
        collection: collection.value,
        entryId: entryId.value,
        baseVersion: lastHydratedVersion.value,
        serverVersion: currentEntry.draftVersion,
      })
      return false
    }
    if (!runSilent) {
      studioDebug.debug('saveDraft:start', {
        collection: collection.value,
        entryId: entryId.value,
        slug: form.slug,
        path: computedPath.value,
      })
    }

    try {
      const slugMode =
        collectionConfig.value?.slugMode ?? collectionConfig.value?.routing?.slugMode ?? 'shared'
      const currentSlug = currentEntry.slug ?? currentEntry.baseSlug
      const nextSharedData = (buildSharedData() ?? {}) as JsonObject
      const currentSharedData = (currentEntry.draft ?? {}) as JsonObject
      const nextLocalizedData = (buildLocalizedData(dataFields) ?? {}) as JsonObject
      const currentLocalizedData = (currentEntry.localeData?.draft.values ?? {}) as JsonObject
      const nextBodyMdc = buildBodyMdc(dataFields)
      const currentBodyMdc = currentEntry.localeData?.draft.bodyMdc ?? ''
      const sharedChanged =
        !isEqualJsonValue(currentSharedData, nextSharedData) ||
        (isTree.value && form.kind !== (currentEntry.nodeKind ?? 'page'))
      const localizedChanged = !isEqualJsonValue(currentLocalizedData, nextLocalizedData)
      const bodyMdcChanged =
        nextBodyMdc !== undefined && (currentBodyMdc ?? '') !== (nextBodyMdc ?? '')
      const parentChanged =
        isTree.value && form.parentEntryId !== (currentEntry.parentEntryId ?? '')

      const routeBacked =
        collectionConfig.value?.mode !== 'none' && collectionConfig.value?.routing?.mode !== 'none'
      const slugChanged = routeBacked && !!form.slug && form.slug !== currentSlug
      const sharedPatch: {
        parentEntryId?: string | null
        slug?: string | null
        shared?: JsonObject
        nodeKind?: NodeKind
      } = {}
      if (slugChanged && slugMode !== 'localized' && slugMode !== 'localizedStable') {
        sharedPatch.slug = form.slug
      }
      if (sharedChanged) {
        sharedPatch.shared = nextSharedData
        if (isTree.value) sharedPatch.nodeKind = form.kind as NodeKind
      }
      if (parentChanged) {
        sharedPatch.parentEntryId = form.parentEntryId || null
      }
      const localePatch: {
        slug?: string | null
        values?: JsonObject
        bodyMdc?: string | null
      } = {}
      if (slugChanged && (slugMode === 'localized' || slugMode === 'localizedStable')) {
        localePatch.slug = form.slug
      }
      if (localizedChanged) {
        localePatch.values = nextLocalizedData
      }
      if (bodyMdcChanged) {
        localePatch.bodyMdc = nextBodyMdc
      }

      const saveResult = await saveEntryDraftMutation({
        entryId: entryId.value,
        expectedDraftVersion: lastHydratedVersion.value ?? currentEntry.draftVersion,
        patch: {
          ...(Object.keys(sharedPatch).length > 0 ? { shared: sharedPatch } : {}),
          ...(Object.keys(localePatch).length > 0
            ? { locales: { [currentLocale.value]: localePatch } }
            : {}),
        } as FunctionArgs<typeof api.ginkoCms.editor.saveEntryDraft>['patch'],
      })
      const draftVersion = saveResult?.draftVersion ?? currentEntry.draftVersion
      // Advance the base version before the live query catches up so the
      // external-change watcher does not treat our own save as a conflict.
      lastHydratedVersion.value = draftVersion
      await refreshEntry()
      lastSaved.value = new Date()
      offlineRetry.clear()
      offlineSavePending.value = false
      if (!runSilent) {
        studioDebug.debug('saveDraft:success', {
          collection: collection.value,
          entryId: entryId.value,
          draftVersion,
        })
      }
      return true
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.saveDraftError'))
      if (isConcurrentEditError(e)) {
        offlineRetry.clear()
        offlineSavePending.value = false
        saveConflict.value = true
      } else if (isTransientSaveError(e)) {
        offlineRetry.markPending()
        offlineSavePending.value = true
      }
      studioDebug.error('saveDraft:error', {
        collection: collection.value,
        entryId: entryId.value,
        silent: runSilent,
        error: e,
      })
      return false
    }
  })

  async function handleSaveDraft(silent = false) {
    if (!canEditEntries.value) return false

    cancelAutoSave()
    const requestedEditSerial = editSerial.value
    if (!silent) {
      saving.value = true
    }

    try {
      const succeeded = await saveQueue.enqueue({ silent })
      if (succeeded) {
        lastPersistedEditSerial.value = requestedEditSerial
        if (editSerial.value === requestedEditSerial) {
          isDirty.value = false
        } else {
          isDirty.value = true
          scheduleAutoSave()
        }
      }
      return succeeded
    } finally {
      if (!saveQueue.active) {
        saving.value = false
      }
    }
  }

  return {
    isDirty,
    saving,
    saveState,
    error,
    offlineSavePending,
    saveConflict,
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
