import {
  resolveDescriptionFieldKey,
  resolveTitleFieldKey,
} from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { CmsField } from '@lupinum/ginko-cms-contract/shared/types.js'
import { compareOrderRank } from '@public/utils/cmsFields'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { codeDefinedCollectionDetail } from '../../lib/codeDefinedCollections'
import { useCmsConfig } from '../useCmsConfig'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useCmsStudioSettings } from '../useCmsStudioSettings'
import { useStudioDebug } from '../useStudioDebug'
import type { StudioCollectionConfig, StudioField } from './types'

interface ParentEntry {
  _id: string
  path: string
  title: string
  order: string
  parentEntryId: string | null
  [key: string]: unknown
}

export function useEntryLoader() {
  useCmsStudioAccess()

  const router = useRouter()
  const route = useRoute()
  const collection = computed(() => String(route.params.collection))
  const entryId = computed(() => String(route.params.id))
  const cmsConfig = useCmsConfig()
  const studioRoute = cmsConfig.route.replace(/\/$/, '')
  const contentRoute = `${studioRoute}/content`
  const studioSettings = useCmsStudioSettings()
  const locales = computed(() => studioSettings.locales.value)
  const defaultLocale = computed(() => studioSettings.defaultLocale.value)
  const routeLocale = computed(() =>
    typeof route.query.locale === 'string' ? route.query.locale : defaultLocale.value,
  )
  const studioDebug = useStudioDebug('collection:edit')
  const { t, dateLocale } = useCmsI18n()

  const entryQuery = useCmsStudioQuery(
    api.ginkoCms.editor.getEntry,
    computed(() => ({ id: entryId.value, locale: routeLocale.value })),
  )
  const collectionSchemaQuery = useCmsStudioQuery(
    api.ginkoCms.collections.getCollection,
    computed(() => ({ slug: collection.value })),
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
  const isTree = computed(() => collectionConfig.value?.type === 'tree')
  const parentEntriesArgs = computed(() =>
    isTree.value ? { collection: collection.value, locale: defaultLocale.value } : null,
  )
  const parentEntriesQuery = useCmsStudioQuery(api.ginkoCms.editor.listEntries, parentEntriesArgs)

  studioDebug.watchQueryError('getEntry', entryQuery, { collection, entryId })
  studioDebug.watchQueryError('getCollection', collectionSchemaQuery, {
    collection,
    entryId,
  })
  studioDebug.watchQueryError('listEntries', parentEntriesQuery, {
    collection,
    entryId,
    isTree,
  })

  const { data: entry, pending } = entryQuery
  const entryCan = computed(() => entry.value?._can ?? {})
  const canEditEntries = computed(() => entryCan.value.edit === true)
  const canPublishEntries = computed(() => entryCan.value.publish === true)
  const canArchiveEntries = computed(() => entryCan.value.archive === true)
  const fields = computed<StudioField[]>(() => collectionConfig.value?.fields ?? [])
  const sharedFields = computed(() => fields.value.filter((field) => !field.localized))
  const localizedFields = computed(() => fields.value.filter((field) => field.localized))

  // --- Writing-surface hero fields (display-only) ---
  // Title/description render as a large borderless heading + subtitle instead
  // of boxed form inputs. CRITICAL: sharedFields/localizedFields above stay
  // untouched — useEntryDraft/useEntryLocales/copyPrimaryToSecondary build
  // save payloads from them; the hero extraction only changes what the
  // generic field loops RENDER (the *DetailFields lists below).
  function heroEligible(field: StudioField | null | undefined): field is StudioField {
    return (
      !!field &&
      (field.type === 'text' || field.type === 'textarea') &&
      !field.hidden &&
      !field.condition
    )
  }
  const heroTitleField = computed<StudioField | null>(() => {
    const key = resolveTitleFieldKey(fields.value as CmsField[], collectionConfig.value?.settings)
    const field = key ? fields.value.find((candidate) => candidate.key === key) : null
    return heroEligible(field) ? field : null
  })
  const heroDescriptionField = computed<StudioField | null>(() => {
    // No hero without a title — a lone floating description reads as a bug.
    if (!heroTitleField.value) return null
    const key = resolveDescriptionFieldKey(
      fields.value as CmsField[],
      collectionConfig.value?.settings,
    )
    const field = key ? fields.value.find((candidate) => candidate.key === key) : null
    // The description joins the hero only when it lives on the same surface
    // as the title (both localized or both shared) — a mixed pair would strip
    // a field from one render loop without any hero rendering it.
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
  const localeVariants = computed(() => entry.value?.localeVariants ?? [])
  const currentLocale = computed(() => entry.value?.locale ?? routeLocale.value)
  const existingEntries = computed<ParentEntry[]>(
    () => (parentEntriesQuery.data.value as ParentEntry[] | null | undefined) ?? [],
  )
  const parentPathById = computed<Map<string, string>>(
    () => new Map(existingEntries.value.map((item) => [item._id, item.path])),
  )

  interface TreeNode extends ParentEntry {
    children: TreeNode[]
  }

  const parentOptions = computed(() => {
    if (!existingEntries.value) return []
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []
    for (const item of existingEntries.value)
      map.set(item._id, { ...item, children: [] } as TreeNode)
    for (const item of existingEntries.value) {
      const node = map.get(item._id)
      if (item.parentEntryId && map.has(item.parentEntryId)) {
        map.get(item.parentEntryId)?.children.push(node!)
      } else {
        roots.push(node!)
      }
    }
    const result: Array<TreeNode & { indent: string }> = []
    const walk = (items: TreeNode[], depth: number) => {
      items.sort((left, right) => compareOrderRank(left.order, right.order))
      for (const item of items) {
        result.push({ ...item, indent: '\xA0\xA0'.repeat(depth) })
        walk(item.children, depth + 1)
      }
    }
    walk(roots, 0)
    return result
  })

  const initialized = ref(false)
  watch(
    () => [route.params.id, route.query.locale],
    () => {
      initialized.value = false
    },
  )

  return {
    router,
    route,
    collection,
    entryId,
    contentRoute,
    studioDebug,
    t,
    dateLocale,
    locales,
    defaultLocale,
    collectionConfig,
    isTree,
    entry,
    pending,
    canEditEntries,
    canPublishEntries,
    canArchiveEntries,
    fields,
    sharedFields,
    localizedFields,
    heroTitleField,
    heroDescriptionField,
    sharedDetailFields,
    localizedDetailFields,
    localeVariants,
    currentLocale,
    parentPathById,
    parentOptions,
    initialized,
    refreshEntry: entryQuery.refresh,
  }
}
