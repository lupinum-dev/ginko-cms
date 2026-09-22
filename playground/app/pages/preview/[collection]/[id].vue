<template>
  <div>
    <ClientOnly>
      <!-- The landing editor provides its own persistent draft toolbar. -->
      <div
        v-if="!isAuthenticated || routeCollection !== 'landing'"
        class="border-b-2 border-amber-400 bg-amber-50 text-amber-900"
      >
        <div class="max-w-2xl mx-auto px-8 py-3 text-sm">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <NuxtLink :to="studioPath" class="underline">← Studio</NuxtLink>
            <span
              class="inline-flex items-center rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950"
            >
              Working
            </span>
            <span class="font-medium">Shared working version · Only visible to your team</span>
            <label v-if="isAuthenticated" class="inline-flex items-center gap-2">
              <span class="sr-only">Preview language</span>
              <select
                :value="locale"
                aria-label="Preview language"
                class="rounded border border-amber-500 bg-amber-50 px-2 py-1"
                @change="changePreviewLanguage"
              >
                <option value="en">English</option>
                <option value="de">German</option>
              </select>
            </label>
            <NuxtLink
              v-if="isAuthenticated"
              :to="studioPath"
              class="rounded bg-amber-950 px-3 py-1 text-white"
              >Edit in Studio</NuxtLink
            >
            <NuxtLink
              v-if="preview?.publishedPath"
              :to="localePath(preview.publishedPath, preview.locale)"
              class="underline"
              >View published</NuxtLink
            >
          </div>
          <div v-if="preview" class="mt-1 text-xs text-amber-800">
            Will publish to
            <span class="font-mono">{{ localePath(preview.path, preview.locale) }}</span>
            <template v-if="preview.publishedPath">
              · published version at
              <NuxtLink
                :to="localePath(preview.publishedPath, preview.locale)"
                class="font-mono underline"
              >
                {{ localePath(preview.publishedPath, preview.locale) }}
              </NuxtLink>
            </template>
          </div>
        </div>
      </div>

      <LandingDraftEditor
        v-if="isAuthenticated && routeCollection === 'landing'"
        :key="`${entryId}:${locale}`"
        :entry_id="entryId"
        :locale="locale"
      />

      <div v-else class="max-w-2xl mx-auto p-8">
        <div v-if="authPending" class="text-gray-500">Checking your Studio session...</div>

        <div v-else-if="!isAuthenticated" class="space-y-2">
          <h1 class="text-xl font-semibold">Studio sign-in required</h1>
          <p class="text-gray-600">Draft previews are only visible to signed-in Studio members.</p>
          <NuxtLink :to="signInPath" class="text-blue-600 hover:underline">
            Sign in to Studio
          </NuxtLink>
        </div>

        <div v-else-if="pending" class="text-gray-500">Loading draft preview...</div>

        <!-- Never fall back to the live version when draft rendering fails. -->
        <div v-else-if="error || bodyDecodeError" class="space-y-2">
          <h1 class="text-xl font-semibold text-red-700">Draft preview unavailable</h1>
          <p class="text-red-600">{{ errorMessage }}</p>
          <div class="flex gap-4">
            <button type="button" class="underline" :disabled="retrying" @click="retryPreview">
              {{ retrying ? 'Retrying…' : 'Try again' }}
            </button>
            <NuxtLink :to="studioPath" class="underline">Open this page in Studio</NuxtLink>
          </div>
        </div>

        <article v-else-if="previewDoc" :lang="locale" class="prose dark:prose-invert max-w-none">
          <h1>{{ previewDoc.title }}</h1>
          <p v-if="previewDoc.description" class="text-gray-500 text-lg">
            {{ previewDoc.description }}
          </p>
          <ContentRenderer :value="previewDoc">
            <template #empty>
              <div class="text-gray-400 italic">This draft has no content yet.</div>
            </template>
          </ContentRenderer>
        </article>

        <div v-else class="text-gray-500">Draft preview not found.</div>
      </div>
      <template #fallback>
        <div class="border-b-2 border-amber-400 bg-amber-50 p-6 text-amber-900" role="status">
          Private draft · Loading preview…
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { decodeContentBodyAstJson } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import { setResponseHeader } from 'h3'
import { computed, ref } from 'vue'

// EDT-10 draft preview host page (v1 convention: /preview/[collection]/[id]?locale=…).
//
// - Requires the same-origin Better Auth Studio session; the Convex query is
//   additionally canRead-guarded server-side (no tokens — CND-06 is separate).
// - Reads DRAFT data through the dedicated guarded query, never the public
//   provider, and renders it with the same <ContentRenderer> the public pages
//   use, so the body honestly matches what publishing would produce.
// - noindex via meta AND X-Robots-Tag; the banner above makes the draft state
//   unmistakable.
import { api } from '#convex/api'
import { getCmsErrorCode } from '#ginko-cms-public/utils/cmsErrors'

const route = useRoute()
const router = useRouter()
const { defaultLocale, localePath } = useI18n()

const entryId = computed(() => String(route.params.id ?? ''))
const routeCollection = computed(() => String(route.params.collection ?? ''))
const locale = computed(() => {
  const requested = route.query.locale
  // defaultLocale() is loosely typed as possibly undefined; an empty string
  // fails closed in the backend (DRAFT_PREVIEW_LOCALE_MISSING) instead of
  // silently assuming a hardcoded language.
  return typeof requested === 'string' && requested ? requested : (defaultLocale() ?? '')
})

useHead({
  title: 'Draft preview',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
if (import.meta.server) {
  const event = useRequestEvent()
  if (event) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
  }
}

const auth = useConvexAuth()
const authPending = computed(() => auth.pending.value)
const isAuthenticated = computed(() => auth.status.value === 'authenticated')
const signInPath = computed(
  () => `/studio/auth/signin?redirect=${encodeURIComponent(route.fullPath)}`,
)
const studioPath = computed(
  () =>
    `/studio/content/${encodeURIComponent(routeCollection.value)}/${encodeURIComponent(entryId.value)}?locale=${encodeURIComponent(locale.value)}`,
)
function changePreviewLanguage(event: Event) {
  if (event.target instanceof HTMLSelectElement)
    void router.push({ path: route.path, query: { ...route.query, locale: event.target.value } })
}

const { data, pending, error, refresh } = await useConvexQuery(
  api.ginkoCms.draftPreview.getDraftPreview,
  () =>
    routeCollection.value === 'landing' ? 'skip' : { entryId: entryId.value, locale: locale.value },
  { server: false, auth: 'required' },
)

// The URL's collection segment is informational; refuse to render an entry
// under a URL that claims a different collection.
const preview = computed(() =>
  data.value &&
  data.value.collection === routeCollection.value &&
  data.value.entryId === entryId.value &&
  data.value.locale === locale.value
    ? data.value
    : null,
)

const retrying = ref(false)
async function retryPreview() {
  retrying.value = true
  try {
    await refresh()
  } catch {
    // The query retains its actionable error state while retry is available.
  } finally {
    retrying.value = false
  }
}

// Keep MDC's reserved component markers intact across Convex's JSON-text boundary.
const decodedBody = computed(() => {
  if (!preview.value?.bodyAstJson) return { body: null, error: false }
  try {
    return {
      body: decodeContentBodyAstJson(preview.value.bodyAstJson),
      error: false,
    }
  } catch {
    return { body: null, error: true }
  }
})
const bodyDecodeError = computed(() => decodedBody.value.error)

// Shape the guarded draft payload like a public content document so the same
// renderer (and prose styling) applies.
const previewDoc = computed(() => {
  if (!preview.value || bodyDecodeError.value) return null
  const description = preview.value.data.description
  return {
    collection: preview.value.collection,
    locale: preview.value.locale,
    title: preview.value.title,
    description: typeof description === 'string' ? description : undefined,
    body: decodedBody.value.body,
  }
})

const errorMessage = computed(() => {
  const code = getCmsErrorCode(error.value)
  const raw = error.value?.message ?? ''
  if (code === 'DRAFT_PREVIEW_NOT_ROUTE_BACKED' || raw.includes('DRAFT_PREVIEW_NOT_ROUTE_BACKED')) {
    return 'This content has no website page to preview.'
  }
  if (code === 'DRAFT_PREVIEW_LOCALE_MISSING' || raw.includes('DRAFT_PREVIEW_LOCALE_MISSING')) {
    return 'This language has no draft to preview.'
  }
  if (code === 'PUBLISH_BODY_UNSAFE')
    return 'This page includes a content block or property that the website does not support yet. Open Studio to review it.'
  if (code?.startsWith('PUBLIC_ASSET_'))
    return 'An image is not available for the website. Open Studio to choose an available image.'
  return 'The working version could not be loaded. Try again or open Studio to review it.'
})
</script>
