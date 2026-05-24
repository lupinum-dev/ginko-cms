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
    localeVariants,
    currentLocale,
    parentPathById,
    parentOptions,
    initialized,
    refreshEntry: entryQuery.refresh,
  }
}
