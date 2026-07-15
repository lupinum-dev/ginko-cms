import { reactive, type Ref } from 'vue'

import type { StudioEntry } from './types'
import { useEntryDraft } from './useEntryDraft'
import { useEntryHistory } from './useEntryHistory'
import { useEntryLoader } from './useEntryLoader'
import { useEntryLocales } from './useEntryLocales'
import { useEntryPublishing } from './useEntryPublishing'
import { useStudioEntryWorkflow } from './useStudioEntryWorkflow'

// The editor context WITHOUT the public-workflow slice. Split out so
// useStudioEntryWorkflow can accept a fully-typed context without creating a
// circular reference (its return type feeds `workflow`, which is added on top of
// this base). Consumers use StudioEntryEditorContext (base + workflow).
function createStudioEntryEditorContextBase() {
  const loader = useEntryLoader()
  const entry = loader.entry as Ref<StudioEntry | null>

  const draft = useEntryDraft({
    entry,
    collection: loader.collection,
    entryId: loader.entryId,
    contentRoute: loader.contentRoute,
    collectionConfig: loader.collectionConfig,
    isTree: loader.isTree,
    fields: loader.fields,
    sharedFields: loader.sharedFields,
    localizedFields: loader.localizedFields,
    currentLocale: loader.currentLocale,
    parentPathById: loader.parentPathById,
    canEditEntries: loader.canEditEntries,
    studioDebug: loader.studioDebug,
    t: loader.t,
    initialized: loader.initialized,
    refreshEntry: loader.refreshEntry,
  })

  const locales = useEntryLocales({
    entry,
    entryId: loader.entryId,
    collection: loader.collection,
    contentRoute: loader.contentRoute,
    router: loader.router,
    collectionConfig: loader.collectionConfig,
    locales: loader.locales,
    localeVariants: loader.localeVariants,
    currentLocale: loader.currentLocale,
    defaultLocale: loader.defaultLocale,
    localizedFields: loader.localizedFields,
    canEditEntries: loader.canEditEntries,
    saving: draft.saving,
    error: draft.error,
    isDirty: draft.isDirty,
    form: draft.form,
    handleSaveDraft: draft.handleSaveDraft,
    cancelAutoSave: draft.cancelAutoSave,
    buildLocalizedData: draft.buildLocalizedData,
    t: loader.t,
  })

  const history = useEntryHistory({
    entry,
    entryId: loader.entryId,
    collection: loader.collection,
    canEditEntries: loader.canEditEntries,
    canPublishEntries: loader.canPublishEntries,
    saving: draft.saving,
    error: draft.error,
    requestHydrate: draft.requestHydrate,
    handleSaveDraft: draft.handleSaveDraft,
    studioDebug: loader.studioDebug,
    t: loader.t,
  })

  const publishing = useEntryPublishing({
    entry,
    entryId: loader.entryId,
    collection: loader.collection,
    contentRoute: loader.contentRoute,
    router: loader.router,
    fields: loader.fields,
    localeVariants: loader.localeVariants,
    currentLocale: loader.currentLocale,
    canPublishEntries: loader.canPublishEntries,
    canArchiveEntries: loader.canArchiveEntries,
    saving: draft.saving,
    error: draft.error,
    isDirty: draft.isDirty,
    form: draft.form,
    handleSaveDraft: draft.handleSaveDraft,
    buildSharedData: draft.buildSharedData,
    buildLocalizedData: draft.buildLocalizedData,
    dataFields: draft.dataFields,
    studioDebug: loader.studioDebug,
    t: loader.t,
  })

  function copyPrimaryToSecondary() {
    for (const field of loader.localizedFields.value) {
      locales.secondaryDataFields[field.key] = draft.dataFields[field.key]
    }
  }

  return reactive({
    loader,
    draft,
    locales,
    history,
    publishing,
    copyPrimaryToSecondary,
  })
}

export type StudioEntryEditorContextBase = ReturnType<typeof createStudioEntryEditorContextBase>

export function useStudioEntryEditor() {
  const context = createStudioEntryEditorContextBase()

  // Public-workflow orchestration (readiness/visibility queries, publish-impact
  // preview, translation readiness, route validation). Built here so it hangs off
  // the shared editor context (`editor.workflow`) and reaches BOTH the page
  // subtree (top bar, publish dialog) and the layout-tree details panel through
  // one instance — a single source of truth for the publish preview state. See
  // useStudioEntryWorkflow for the extraction rationale (RFC Phase 5 / D8).
  const workflow = useStudioEntryWorkflow(context)

  return Object.assign(context, { workflow })
}
