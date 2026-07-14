<script setup lang="ts">
import { ArrowRight, FileText, History, Loader2, Search, Zap } from '@lucide/vue'
import { ListboxFilter } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { cmsPermissionKeys, type CmsPermissionKey } from '../composables/permissions'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useStudioSearch } from '../composables/useStudioSearch'
import {
  studioRouteHref,
  studioStaticRoutes,
  type StudioStaticRoute,
} from '../lib/studioNavigation'

const router = useRouter()

interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  href?: string
  group: 'recent' | 'content' | 'links' | 'actions'
  action?: () => Promise<void> | void
}

interface SearchResultItem {
  _id: string
  title?: string | null
  slug: string
  snippet?: string | null
  collection: string
}

const props = defineProps<{
  studioRoute: string
}>()
const contentRoute = computed(() => `${props.studioRoute}/content`)
const { t } = useCmsI18n()
const { can } = useCmsStudioAccess()
const canManageCollections = can(cmsPermissionKeys.manageCollections)
const canManageAssets = can(cmsPermissionKeys.manageAssets)
const canManageSettings = can(cmsPermissionKeys.manageSettings)
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const open = ref(false)
const query = ref('')
const recentItems = ref<PaletteItem[]>([])
const route = useRoute()
const collection = computed(() => route.params.collection)
const debouncedQuery = ref('')

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(query, (val: string) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 250)
})

const cmsSearch = useStudioSearch(debouncedQuery, {
  collection: computed(() =>
    typeof route.params.collection === 'string' ? route.params.collection : undefined,
  ),
  limit: 10,
})
const searchPending = computed(
  () => query.value !== debouncedQuery.value || cmsSearch.pending?.value,
)

const capabilityAccess: Partial<Record<CmsPermissionKey, typeof canManageAssets>> = {
  [cmsPermissionKeys.manageAssets]: canManageAssets,
  [cmsPermissionKeys.manageCollections]: canManageCollections,
  [cmsPermissionKeys.manageSettings]: canManageSettings,
  [cmsPermissionKeys.publishEntries]: canPublishEntries,
}
function canAccessRoute(route: StudioStaticRoute): boolean {
  const requiredCapability = route.requiredCapability
  return !requiredCapability || capabilityAccess[requiredCapability]?.value === true
}

const staticLinks = computed<PaletteItem[]>(() =>
  studioStaticRoutes.filter(canAccessRoute).map((route) => ({
    id: `link-${route.id}`,
    title: t(route.labelKey),
    subtitle: route.subtitleKey ? t(route.subtitleKey) : undefined,
    href: studioRouteHref(props.studioRoute, route),
    group: 'links' as const,
  })),
)

const actionItems = computed((): PaletteItem[] => {
  const items: PaletteItem[] = []
  if (collection.value) {
    items.push({
      id: `action-new-${collection.value}`,
      title: t('ginkoCms.studio.commandPalette.newDraftTitle', {
        collection: String(collection.value),
      }),
      subtitle: t('ginkoCms.studio.commandPalette.newEntrySubtitle'),
      href: `${contentRoute.value}/${collection.value}/new`,
      group: 'actions',
    })
  }
  return items
})

const searchItems = computed<PaletteItem[]>(() =>
  (cmsSearch.results.value as SearchResultItem[]).map((item) => ({
    id: `content-${item._id}`,
    title: item.title || item.slug,
    subtitle: item.snippet ?? `${item.collection} content`,
    href: `${contentRoute.value}/${item.collection}/${item._id}`,
    group: 'content',
  })),
)

const recentSection = computed<PaletteItem[]>(() =>
  query.value ? [] : recentItems.value.filter((item) => item.href),
)

// The palette runs a debounced SERVER search and expects every provided item to
// render; the refreshed reka-ui Command otherwise filters items client-side by
// their rendered text against filterState.search. We deliberately keep the
// Command's internal filter disabled (its search state is never populated — see
// the ListboxFilter bound to `query` below) and drive visibility purely from the
// server results + these v-if guards, so this custom empty state replaces the
// self-gating <CommandEmpty>.
const hasAnyItems = computed(
  () =>
    recentSection.value.length > 0 ||
    searchItems.value.length > 0 ||
    staticLinks.value.length > 0 ||
    actionItems.value.length > 0,
)

watch(open, (value) => {
  if (!value) {
    query.value = ''
  }
})

watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

function rememberItem(item: PaletteItem) {
  if (!item.href) return
  const next: PaletteItem[] = [
    {
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
      group: 'recent' as const,
    },
    ...recentItems.value.filter((entry) => entry.href !== item.href),
  ].slice(0, 6)
  recentItems.value = next
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ginko-cms-command-palette-recent', JSON.stringify(next))
  }
}

async function selectItem(item: PaletteItem | undefined) {
  if (!item) return
  rememberItem(item)
  open.value = false
  if (item.action) {
    await item.action()
    return
  }
  if (item.href) {
    await router.push(item.href)
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open.value = !open.value
  }
}

onMounted(() => {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('ginko-cms-command-palette-recent')
    if (raw) {
      try {
        recentItems.value = JSON.parse(raw)
      } catch {
        recentItems.value = []
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <CommandDialog
    :open="open"
    :title="t('ginkoCms.studio.commandPalette.title')"
    :description="t('ginkoCms.studio.commandPalette.description')"
    @update:open="open = $event"
  >
    <!--
      Custom command input: bind reka's ListboxFilter to `query` (which drives
      the debounced server search) rather than the Command context's
      filterState.search. This intentionally leaves the Command's internal
      client-side filter disabled so all server-provided items render. Markup
      mirrors ui/command/CommandInput.vue.
    -->
    <div
      data-slot="command-input-wrapper"
      class="ginko:flex ginko:h-12 ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3"
    >
      <Search class="ginko:size-4 ginko:shrink-0 ginko:opacity-50" />
      <ListboxFilter
        v-model="query"
        auto-focus
        data-slot="command-input"
        :placeholder="t('ginkoCms.studio.commandPalette.placeholder')"
        class="ginko:placeholder:text-muted-foreground ginko:flex ginko:h-12 ginko:w-full ginko:rounded-md ginko:bg-transparent ginko:py-3 ginko:text-sm ginko:outline-hidden ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50"
      />
    </div>
    <CommandList>
      <div
        v-if="searchPending && query"
        class="ginko:flex ginko:items-center ginko:justify-center ginko:py-8 ginko:text-sm ginko:text-muted-foreground"
      >
        <Loader2 class="ginko:mr-2 ginko:size-4 ginko:animate-spin" />
        {{ t('ginkoCms.studio.commandPalette.searching') }}
      </div>

      <div
        v-else-if="!hasAnyItems"
        class="ginko:py-6 ginko:text-center ginko:text-sm ginko:text-muted-foreground"
      >
        {{ t('ginkoCms.studio.commandPalette.noResults') }}
      </div>

      <CommandGroup v-if="recentSection.length" :heading="t('ginkoCms.common.recent')">
        <CommandItem
          v-for="item in recentSection"
          :key="item.id"
          :value="item.id"
          @select="selectItem(item)"
        >
          <History class="ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:flex-1">
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">{{ item.title }}</div>
            <div
              v-if="item.subtitle"
              class="ginko:truncate ginko:text-xs ginko:text-muted-foreground"
            >
              {{ item.subtitle }}
            </div>
          </div>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator v-if="recentSection.length && searchItems.length" />

      <CommandGroup v-if="searchItems.length" :heading="t('ginkoCms.common.content')">
        <CommandItem
          v-for="item in searchItems"
          :key="item.id"
          :value="item.id"
          @select="selectItem(item)"
        >
          <FileText class="ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:flex-1">
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">{{ item.title }}</div>
            <div
              v-if="item.subtitle"
              class="ginko:truncate ginko:text-xs ginko:text-muted-foreground"
            >
              {{ item.subtitle }}
            </div>
          </div>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator
        v-if="(recentSection.length || searchItems.length) && staticLinks.length"
      />

      <CommandGroup :heading="t('ginkoCms.common.pages')">
        <CommandItem
          v-for="item in staticLinks"
          :key="item.id"
          :value="item.id"
          @select="selectItem(item)"
        >
          <ArrowRight class="ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:flex-1">
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">{{ item.title }}</div>
            <div
              v-if="item.subtitle"
              class="ginko:truncate ginko:text-xs ginko:text-muted-foreground"
            >
              {{ item.subtitle }}
            </div>
          </div>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator v-if="actionItems.length" />

      <CommandGroup v-if="actionItems.length" :heading="t('ginkoCms.common.actions')">
        <CommandItem
          v-for="item in actionItems"
          :key="item.id"
          :value="item.id"
          @select="selectItem(item)"
        >
          <Zap class="ginko:text-muted-foreground" />
          <div class="ginko:min-w-0 ginko:flex-1">
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">{{ item.title }}</div>
            <div
              v-if="item.subtitle"
              class="ginko:truncate ginko:text-xs ginko:text-muted-foreground"
            >
              {{ item.subtitle }}
            </div>
          </div>
        </CommandItem>
      </CommandGroup>
    </CommandList>

    <div
      class="ginko:flex ginko:items-center ginko:justify-between ginko:border-t ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
    >
      <span>{{ t('ginkoCms.studio.commandPalette.openHint') }}</span>
      <span>{{ t('ginkoCms.studio.commandPalette.navigateHint') }}</span>
    </div>
  </CommandDialog>
</template>
