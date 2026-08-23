<template>
  <div>
    <!-- Draft banner: always visible, impossible to mistake for the live page. -->
    <div class="border-b-2 border-amber-400 bg-amber-50 text-amber-900">
      <div class="max-w-2xl mx-auto px-8 py-3 text-sm">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            class="inline-flex items-center rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950"
          >
            Draft preview
          </span>
          <span class="font-medium">Not publicly visible.</span>
          <span v-if="preview" class="text-amber-800">
            {{ preview.title }} · {{ preview.locale.toUpperCase() }} ·
            {{ draftStateLabel }}
          </span>
        </div>
        <div v-if="preview" class="mt-1 text-xs text-amber-800">
          Will publish to <span class="font-mono">{{ preview.path }}</span>
          <template v-if="preview.publishedPath">
            · live version at
            <NuxtLink :to="preview.publishedPath" class="font-mono underline">
              {{ preview.publishedPath }}
            </NuxtLink>
          </template>
          · Images may not display in preview.
        </div>
      </div>
    </div>

    <div class="max-w-2xl mx-auto p-8">
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
      <div v-else-if="error" class="space-y-2">
        <h1 class="text-xl font-semibold text-red-700">Draft preview unavailable</h1>
        <p class="text-red-600">{{ errorMessage }}</p>
      </div>

      <article v-else-if="previewDoc" class="prose dark:prose-invert max-w-none">
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
  </div>
</template>

<script setup lang="ts">
import { setResponseHeader } from 'h3'
import { computed } from 'vue'

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

const route = useRoute()
const { defaultLocale } = useI18n()

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
  if (event) setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
}

const auth = useConvexAuth()
const authPending = computed(() => auth.pending.value)
const isAuthenticated = computed(() => auth.status.value === 'authenticated')
const signInPath = computed(
  () => `/studio/auth/signin?redirect=${encodeURIComponent(route.fullPath)}`,
)

const { data, pending, error } = await useConvexQuery(
  api.ginkoCms.draftPreview.getDraftPreview,
  () => ({ entryId: entryId.value, locale: locale.value }),
  { server: false, auth: 'required' },
)

// The URL's collection segment is informational; refuse to render an entry
// under a URL that claims a different collection.
const preview = computed(() =>
  data.value && data.value.collection === routeCollection.value ? data.value : null,
)

const draftStateLabel = computed(() => {
  if (!preview.value) return ''
  if (preview.value.status === 'archived') return 'Archived draft'
  return preview.value.status === 'published' ? 'Unpublished changes' : 'Draft — never published'
})

// Shape the guarded draft payload like a public content document so the same
// renderer (and prose styling) applies.
const previewDoc = computed(() => {
  if (!preview.value) return null
  const description = preview.value.data.description
  return {
    title: preview.value.title,
    description: typeof description === 'string' ? description : undefined,
    body: preview.value.bodyAst,
  }
})

const errorMessage = computed(() => {
  const raw = error.value?.message ?? ''
  if (raw.includes('DRAFT_PREVIEW_NOT_ROUTE_BACKED')) {
    return 'This content has no website page to preview.'
  }
  if (raw.includes('DRAFT_PREVIEW_LOCALE_MISSING')) {
    return 'This language has no draft to preview.'
  }
  return 'The draft could not be rendered. The live page (if any) is unaffected.'
})
</script>
