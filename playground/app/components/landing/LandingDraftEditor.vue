<script setup lang="ts">
import {
  EntryDraftSession,
  entryDraftSnapshot,
  validateDraftSaveRequest,
} from '@lupinum/ginko-cms/editing'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { z } from 'zod'

import { api } from '#convex/api'
import { getCmsErrorMessage } from '#ginko-cms-public/utils/cmsErrors'

import { landing_content, landing_link, type LandingField } from '../../utils/landingContent'

const props = defineProps<{ entry_id: string; locale: string }>()
const route = useRoute()
const router = useRouter()
const { localePath } = useI18n()
const editing = ref(false)
const composing = ref(false)
const version_view = ref<'working' | 'published'>('working')
const notice = ref('')
const busy = ref(false)
const image_dialog = ref<HTMLDialogElement>()
const publish_dialog = ref<HTMLDialogElement>()
const image_open = ref(false)
const image_search = ref('')

// getEntry's generated return is loose at this consumer boundary. In particular,
// retain persisted maps instead of turning rendered defaults into write baselines.
const json_map = z.record(z.string(), z.json())
const entry_schema = z.object({
  _id: z.string(),
  collection: z.string(),
  draftVersion: z.number(),
  locale: z.string(),
  slug: z.string(),
  baseSlug: z.string().nullable().optional(),
  parentEntryId: z.string().nullable().optional(),
  nodeKind: z.enum(['page', 'folder', 'group', 'section']).nullable().optional(),
  draft: json_map,
  publishedData: json_map.nullable(),
  localeData: z
    .object({
      draftId: z.string().nullable(),
      draftSlug: z.string().nullable().optional(),
      draftPath: z.string().nullable(),
      publishedPath: z.string().nullable(),
      draft: z.object({ values: json_map, bodyMdc: z.string().nullable().optional() }),
      published: z.unknown().nullable(),
    })
    .nullable(),
  locales: z.array(
    z.object({ locale: z.string(), draftExists: z.boolean(), draftId: z.string().nullable() }),
  ),
  _can: z.object({ edit: z.boolean(), publish: z.boolean() }),
})
const query = await useConvexQuery(
  api.ginkoCms.editor.getEntry,
  () => ({ id: props.entry_id, locale: props.locale }),
  { server: false, auth: 'required' },
)
const parsed_entry = computed(() => entry_schema.safeParse(query.data.value))
const entry = computed(() => {
  const parsed = parsed_entry.value
  return parsed.success &&
    parsed.data._id === props.entry_id &&
    parsed.data.collection === 'landing' &&
    parsed.data.locale === props.locale
    ? parsed.data
    : null
})
const locale_exists = computed(
  () => entry.value?.locales.find((item) => item.locale === props.locale)?.draftExists === true,
)
const can_edit = computed(() => entry.value?._can.edit === true && !query.error.value)
const can_publish = computed(() => entry.value?._can.publish === true && !query.error.value)
const mutation = useConvexMutation(api.ginkoCms.editor.saveEntryDraft)
const session_model = new EntryDraftSession({
  entryId: props.entry_id,
  canEdit: () => can_edit.value && locale_exists.value,
  hasPendingEditors: () => composing.value,
  flushEditors: async () => !composing.value,
  save: async (request) => {
    validateDraftSaveRequest(request)
    return z.object({ draftVersion: z.number() }).parse(await mutation(request))
  },
})
const session = reactive(session_model)
watch(
  entry,
  (value) => {
    if (value) session.receive(entryDraftSnapshot(value))
  },
  { immediate: true },
)
const studio_path = computed(
  () =>
    `/studio/content/landing/${encodeURIComponent(props.entry_id)}?locale=${encodeURIComponent(props.locale)}`,
)
const language_name = computed(() => (props.locale === 'de' ? 'German' : 'English'))
const published_path = computed(() => entry.value?.localeData?.publishedPath ?? null)
// Content paths keep their raw identity; the host router owns locale hrefs.
const draft_href = computed(() => {
  const path = entry.value?.localeData?.draftPath
  return path ? localePath(path, props.locale) : null
})
const published_href = computed(() =>
  published_path.value ? localePath(published_path.value, props.locale) : null,
)
const has_publication = computed(
  () => !!entry.value?.localeData?.published && !!published_path.value,
)
const current_values = computed(() =>
  version_view.value === 'published'
    ? (entry.value?.publishedData ?? {})
    : { ...session.patch.shared?.shared, ...session.patch.locales?.[props.locale]?.values },
)
const asset_ids = computed(() =>
  typeof current_values.value.hero_image === 'string' && current_values.value.hero_image
    ? [current_values.value.hero_image]
    : [],
)
const resolved_images = await useConvexQuery(
  api.ginkoCms.assets.resolveAssetUrls,
  () => (asset_ids.value.length ? { assetIds: asset_ids.value } : 'skip'),
  { server: false, auth: 'required' },
)
const content = computed(() => {
  const data = landing_content(current_values.value)
  const urls = z.record(z.string(), z.string().nullable()).safeParse(resolved_images.data.value)
  return { ...data, hero_image: urls.success ? (urls.data[data.hero_image] ?? '') : '' }
})
const state_label = computed(
  () =>
    ({
      saved: 'All changes saved',
      dirty: 'Saving soon…',
      saving: 'Saving…',
      conflict: 'Choose which changes to keep',
      error: 'Couldn’t save — your changes are here',
    })[session.state],
)
const fields_editable = computed(
  () => editing.value && version_view.value === 'working' && can_edit.value && locale_exists.value,
)
const field_labels: Record<LandingField, string> = {
  title: 'Headline',
  description: 'Introduction',
  eyebrow: 'Eyebrow',
  cta_label: 'Button label',
  cta_href: 'Button destination',
  hero_image: 'Image',
  hero_alt: 'Image description',
}

function edit_field(field: string, value: string) {
  if (!fields_editable.value || !Object.hasOwn(field_labels, field)) return
  const patch = session.patch
  const locale = patch.locales?.[props.locale]
  if (!locale) return
  session.edit({
    ...patch,
    locales: {
      ...patch.locales,
      [props.locale]: { ...locale, values: { ...locale.values, [field]: value } },
    },
  })
  notice.value = ''
}
function input_field(field: LandingField, event: Event) {
  if (event.target instanceof HTMLInputElement) edit_field(field, event.target.value)
}
function composition(active: boolean) {
  composing.value = active
  if (active) session.cancelAutoSave()
  else session.schedule()
}
async function flush() {
  const saved = await session.flush()
  if (!saved)
    notice.value = composing.value
      ? 'Finish entering this text before switching views.'
      : 'Your changes are still here. Resolve the highlighted issue before continuing.'
  else notice.value = ''
  return saved
}
async function switch_view(view: 'working' | 'published') {
  if (view === version_view.value || !(await flush())) return
  version_view.value = view
  editing.value = false
}
async function toggle_edit() {
  if (!(await flush())) return
  version_view.value = 'working'
  editing.value = !editing.value
}
async function change_language(event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return
  const requested = event.target.value
  event.target.value = props.locale
  if (requested !== props.locale && (await flush()))
    await router.push({ path: route.path, query: { ...route.query, locale: requested } })
}
const create_locale = useConvexMutation(api.ginkoCms.editor.createLocaleVariant)
async function add_language(copy: boolean) {
  if (!can_edit.value || busy.value || !(await flush())) return
  busy.value = true
  try {
    const source = entry.value?.locales.find(
      (item) => item.draftExists && item.locale !== props.locale,
    )
    await create_locale({
      entryId: props.entry_id,
      locale: props.locale,
      source: copy && source ? { kind: 'locale', locale: source.locale } : { kind: 'blank' },
    })
    await query.refresh()
    editing.value = true
    notice.value = 'Working language created. Nothing has been published.'
  } catch {
    notice.value = 'This language could not be created. Your existing content is safe.'
  } finally {
    busy.value = false
  }
}

const asset_page = await useConvexQuery(
  api.ginkoCms.assets.getAssetManagerData,
  () =>
    image_open.value
      ? {
          kind: 'image' as const,
          deleted: 'active' as const,
          location: 'accessible' as const,
          collection: 'landing',
          entryId: props.entry_id,
          search: image_search.value.trim() || undefined,
          paginationOpts: { cursor: null, numItems: 40 },
          sort: 'name' as const,
        }
      : 'skip',
  { server: false, auth: 'required' },
)
const asset_schema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string().nullable(),
  alt: z.record(z.string(), z.string()).nullable(),
})
const available_images = computed(() => {
  const parsed = z.object({ page: z.array(asset_schema) }).safeParse(asset_page.data.value)
  return parsed.success ? parsed.data.page : []
})
function show_images() {
  image_open.value = true
  image_dialog.value?.showModal()
}
function close_images() {
  image_open.value = false
  image_dialog.value?.close()
}
async function open_media(event: MouseEvent) {
  if (!session.hasPendingWork) return
  event.preventDefault()
  // Keep the click's user gesture, but navigate only after pending edits save.
  const target = window.open('about:blank', '_blank')
  if (target) target.opener = null
  if (!(await flush())) {
    target?.close()
    return
  }
  if (target) target.location.replace(new URL('/studio/assets', window.location.origin).href)
  else notice.value = 'Changes saved. Select Open media library again to open a new tab.'
}
function choose_image(asset: z.infer<typeof asset_schema>) {
  const changed = current_values.value.hero_image !== asset.id
  edit_field('hero_image', asset.id)
  if (changed) edit_field('hero_alt', asset.alt?.[props.locale] ?? '')
  close_images()
}

const preview_publish = useConvexMutation(api.ginkoCms.editor.previewPublishEntryOperation)
const publish = useConvexMutation(api.ginkoCms.editor.publishEntry)
const request_review = useConvexMutation(api.ginkoCms.reviewRequests.requestPublishReview)
const preview_schema = z.object({
  allowed: z.boolean(),
  summary: z.string(),
  blockers: z.array(z.object({ message: z.string() })),
  warnings: z.array(z.object({ message: z.string() })),
  effects: z.array(z.object({ summary: z.string(), count: z.number().nullish() })),
  confirmation: z.object({ token: z.string(), expiresAt: z.number() }).nullish(),
})
const review = ref<{
  version: number
  locale: string
  preview: z.infer<typeof preview_schema>
} | null>(null)
const review_stale = computed(
  () =>
    !!review.value &&
    (review.value.version !== session.version ||
      review.value.locale !== props.locale ||
      session.hasPendingWork),
)
async function prepare_publish() {
  if (!can_publish.value || busy.value || !(await flush())) return
  busy.value = true
  notice.value = ''
  try {
    const version = session.version
    const preview = preview_schema.parse(
      await preview_publish({
        entryId: props.entry_id,
        locales: [props.locale],
        expectedVersion: version,
      }),
    )
    review.value = { version, locale: props.locale, preview }
    publish_dialog.value?.showModal()
  } catch (cause) {
    notice.value =
      cause instanceof z.ZodError
        ? 'The publication review response could not be read. Open this page in Studio to review it.'
        : getCmsErrorMessage(
            cause,
            'Publication review could not be prepared. Check the latest shared changes and try again.',
          )
  } finally {
    busy.value = false
  }
}
async function confirm_publish() {
  const confirmed = review.value
  const token = confirmed?.preview.confirmation
  if (
    !can_publish.value ||
    !confirmed ||
    review_stale.value ||
    !confirmed.preview.allowed ||
    !token ||
    token.expiresAt <= Date.now()
  ) {
    notice.value =
      'The working version changed or this review expired. Review the latest changes again.'
    return
  }
  busy.value = true
  try {
    const result = z
      .object({ status: z.string(), message: z.string().optional() })
      .passthrough()
      .parse(
        await publish({
          entryId: props.entry_id,
          locales: [confirmed.locale],
          expectedVersion: confirmed.version,
          _confirmationToken: token.token,
        }),
      )
    if (result.status !== 'applied') {
      notice.value =
        result.message ?? 'The shared version changed. Prepare a new publication review.'
      return
    }
    publish_dialog.value?.close()
    review.value = null
    notice.value = `${language_name.value} published. Website delivery can be checked in Studio.`
    await query.refresh()
  } catch (cause) {
    notice.value = getCmsErrorMessage(
      cause,
      'Publication could not be completed. Your working changes are saved; review again before retrying.',
    )
  } finally {
    busy.value = false
  }
}
async function ask_review() {
  if (!can_edit.value || busy.value || !(await flush())) return
  busy.value = true
  try {
    await request_review({
      entryId: props.entry_id,
      locales: [props.locale],
      expectedVersion: session.version,
      title: `Publish landing (${props.locale.toUpperCase()})`,
      summary: 'The shared working version is ready for publisher review.',
    })
    notice.value = 'Review requested. A publisher can approve the shared changes in Studio.'
  } catch {
    notice.value = 'Review could not be requested. Check this entry in Studio for the next step.'
  } finally {
    busy.value = false
  }
}
function conflict_name(path: string[]) {
  const key = path.at(-1)
  return key && key in field_labels ? field_labels[key as LandingField] : (key ?? 'Content')
}
function show_value(value: unknown) {
  return typeof value === 'string'
    ? value || '(empty)'
    : value === undefined
      ? '(removed)'
      : JSON.stringify(value)
}
const conflict_rows = computed(() => {
  // Observe replacement through Vue, then format the same model's JSON without
  // making the template instantiate recursively unwrapped JSON types.
  void session.conflicts
  return session_model.conflicts.map((conflict) => ({
    path: [...conflict.path],
    name: conflict_name(conflict.path),
    mine: show_value(conflict.mine),
    shared: show_value(conflict.shared),
  }))
})
function before_unload(event: BeforeUnloadEvent) {
  if (session.hasPendingWork) event.preventDefault()
}
onBeforeRouteLeave(flush)
onBeforeRouteUpdate(flush)
if (import.meta.client) window.addEventListener('beforeunload', before_unload)
onBeforeUnmount(() => {
  session.dispose()
  if (import.meta.client) window.removeEventListener('beforeunload', before_unload)
})
</script>

<template>
  <section class="draft-workspace" aria-label="Website editing" lang="en">
    <header class="draft-toolbar">
      <div class="draft-identity">
        <NuxtLink :to="studio_path">← Studio</NuxtLink>
        <div class="version-switch" role="group" aria-label="Content version">
          <button :aria-pressed="version_view === 'working'" @click="switch_view('working')">
            Working</button
          ><button :aria-pressed="version_view === 'published'" @click="switch_view('published')">
            Published
          </button>
        </div>
        <label class="language-label"
          ><span class="visually-hidden">Language</span
          ><select :value="locale" aria-label="Content language" @change="change_language">
            <option value="en">English</option>
            <option value="de">German</option>
          </select></label
        >
      </div>
      <div class="draft-actions">
        <span class="draft-save-state" role="status" aria-live="polite">{{
          query.pending.value ? 'Loading…' : entry ? state_label : 'Unavailable'
        }}</span>
        <button
          v-if="can_edit && locale_exists"
          :aria-pressed="fields_editable"
          :disabled="busy"
          @click="toggle_edit"
        >
          {{ fields_editable ? 'Preview' : 'Edit page' }}
        </button>
        <button
          v-if="can_publish && locale_exists"
          class="primary"
          :disabled="busy || !!session.conflicts.length"
          @click="prepare_publish"
        >
          Publish…
        </button>
        <button
          v-else-if="can_edit && locale_exists"
          class="primary"
          :disabled="busy || !!session.conflicts.length"
          @click="ask_review"
        >
          Request review
        </button>
      </div>
    </header>
    <div v-if="notice" class="draft-notice" role="status">{{ notice }}</div>
    <div v-if="session.state === 'error'" class="draft-notice" role="alert">
      <strong>Your changes couldn’t be saved.</strong> Check your connection and retry.
      <button :disabled="session.saving" @click="flush">Retry saving</button>
    </div>
    <div v-if="session.conflicts.length" class="draft-notice" role="alert">
      <strong>You and another person changed the same content.</strong>
      <p>Choose what to keep for each field. Changes to other fields stay together.</p>
      <div
        v-for="conflict in conflict_rows"
        :key="JSON.stringify(conflict.path)"
        class="field-conflict"
      >
        <h3>{{ conflict.name }}</h3>
        <div class="conflict-values">
          <div>
            <strong>Your change</strong>
            <p>{{ conflict.mine }}</p>
            <button @click="session.resolve(conflict.path, 'mine')">Keep mine</button>
          </div>
          <div>
            <strong>Shared change</strong>
            <p>{{ conflict.shared }}</p>
            <button @click="session.resolve(conflict.path, 'shared')">Use shared</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="query.error.value" class="draft-empty" role="alert">
      <h1>This page is unavailable</h1>
      <p>Return to Studio to check your access. No private page is shown.</p>
    </div>
    <div
      v-else-if="!query.pending.value && query.data.value && !parsed_entry.success"
      class="draft-empty"
      role="alert"
    >
      <h1>This page format could not be loaded</h1>
      <p>
        Open the page in Studio. The website editor could not read the saved content format; no
        changes were made.
      </p>
      <NuxtLink :to="studio_path">Open in Studio</NuxtLink>
    </div>
    <div v-else-if="!query.pending.value && !entry" class="draft-empty" role="alert">
      <h1>Page not found for this language</h1>
      <p>Return to Studio to choose an available page and language.</p>
    </div>
    <div v-else-if="!session.initialized" class="draft-empty" role="status">
      Loading the shared working version…
    </div>
    <div v-else-if="version_view === 'published' && !has_publication" class="draft-empty">
      <h1>{{ language_name }} is not published yet</h1>
      <p>The working version is private. You can preview it before a public address exists.</p>
      <button @click="switch_view('working')">View working version</button>
    </div>
    <div v-else-if="version_view === 'working' && !locale_exists" class="draft-empty">
      <h1>Add {{ language_name }}</h1>
      <p>
        This page has no {{ language_name }} working version. You are not editing another language’s
        fallback.
      </p>
      <div v-if="can_edit" class="draft-actions">
        <button :disabled="busy" @click="add_language(false)">Start blank</button
        ><button
          v-if="entry?.locales.some((item) => item.draftExists)"
          :disabled="busy"
          @click="add_language(true)"
        >
          Copy existing language
        </button>
      </div>
    </div>
    <template v-else>
      <div class="draft-context">
        <span>{{
          version_view === 'published' ? 'Published version' : 'Shared working version · private'
        }}</span
        ><span v-if="version_view === 'working' && draft_href"
          >Will publish to {{ draft_href }}</span
        ><NuxtLink v-if="version_view === 'published' && published_href" :to="published_href"
          >Open public page ↗</NuxtLink
        ><NuxtLink :to="`${studio_path}&panel=languages`">Review translations in Studio</NuxtLink>
      </div>
      <LandingPage :content="content" :editing="fields_editable" :lang="locale">
        <template v-if="fields_editable" #field="field"
          ><LandingText
            :value="field.value"
            :label="field.label"
            :multiline="field.multiline"
            editing
            @change="edit_field(field.field, $event)"
            @composition="composition"
        /></template>
        <template v-if="fields_editable" #destination
          ><label class="field-control"
            >Button destination<input
              :value="content.cta_href"
              placeholder="/blog"
              maxlength="2048"
              @input="input_field('cta_href', $event)"
              @compositionstart="composition(true)"
              @compositionend="composition(false)"
            /><span v-if="content.cta_href && !landing_link(content.cta_href)" role="alert"
              >Use a website path such as /blog, or an https:// address.</span
            ></label
          ></template
        >
        <template v-if="fields_editable" #image-controls
          ><div class="image-controls">
            <button @click="show_images">
              {{ current_values.hero_image ? 'Change image' : 'Choose image' }}</button
            ><button v-if="current_values.hero_image" @click="edit_field('hero_image', '')">
              Use illustration</button
            ><label v-if="current_values.hero_image" class="field-control"
              >Image description<input
                :value="content.hero_alt"
                maxlength="1000"
                placeholder="Describe the meaningful content, or leave empty if decorative"
                @input="input_field('hero_alt', $event)"
                @compositionstart="composition(true)"
                @compositionend="composition(false)"
            /></label>
            <p v-if="resolved_images.error.value" role="alert">
              The image could not be loaded. Your selected asset is still saved.
            </p>
          </div></template
        >
      </LandingPage>
    </template>
    <dialog ref="image_dialog" aria-labelledby="image-title" @close="image_open = false">
      <div class="dialog-header">
        <h2 id="image-title">Choose an image</h2>
        <button aria-label="Close image library" @click="close_images">Close</button>
      </div>
      <p>
        Choose an existing CMS image, or
        <a href="/studio/assets" target="_blank" rel="noopener noreferrer" @click="open_media"
          >open media library ↗</a
        >
        to upload one in a new tab.
      </p>
      <label class="field-control"
        >Search images<input v-model="image_search" type="search"
      /></label>
      <p v-if="asset_page.error.value" role="alert">
        The media library could not load. Close and try again.
      </p>
      <p v-else-if="asset_page.pending.value" role="status">Loading images…</p>
      <div v-else-if="available_images.length" class="image-grid">
        <button v-for="asset in available_images" :key="asset.id" @click="choose_image(asset)">
          <img v-if="asset.url" :src="asset.url" alt="" /><span>{{ asset.filename }}</span>
        </button>
      </div>
      <p v-else>
        No matching images.
        <a href="/studio/assets" target="_blank" rel="noopener noreferrer" @click="open_media"
          >Open media library ↗</a
        >
        to add an image, then return here to choose it.
      </p>
      <p v-if="available_images.length === 40">
        Showing the first 40 images. Use search to narrow the list.
      </p>
    </dialog>
    <dialog ref="publish_dialog" aria-labelledby="publish-title">
      <div class="dialog-header">
        <h2 id="publish-title">Publish {{ language_name }}</h2>
        <button :disabled="busy" @click="publish_dialog?.close()">Close</button>
      </div>
      <template v-if="review">
        <p>
          Publish the saved changes, including changes from your collaborators, in
          {{ language_name }}.
        </p>
        <p v-if="draft_href">Page: {{ draft_href }}</p>
        <details v-if="review.preview.effects.length">
          <summary>Publication details</summary>
          <p>{{ review.preview.summary }}</p>
          <ul>
            <li v-for="effect in review.preview.effects" :key="effect.summary">
              {{ effect.summary
              }}<template v-if="effect.count != null">: {{ effect.count }}</template>
            </li>
          </ul>
        </details>
        <p v-for="blocker in review.preview.blockers" :key="blocker.message" role="alert">
          {{ blocker.message }}
        </p>
        <p v-for="warning in review.preview.warnings" :key="warning.message">
          {{ warning.message }}
        </p>
        <p v-if="review_stale" role="alert">
          The shared version changed. Review it again before publishing.
        </p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <button
          v-if="review_stale || !review.preview.confirmation"
          :disabled="busy"
          @click="prepare_publish"
        >
          Review latest changes</button
        ><button
          v-else
          class="primary"
          :disabled="busy || !review.preview.allowed || review.preview.blockers.length > 0"
          @click="confirm_publish"
        >
          {{ busy ? 'Publishing…' : `Publish ${language_name}` }}
        </button></template
      >
    </dialog>
  </section>
</template>

<style scoped>
.draft-workspace {
  color: #263f32;
  background: #fffefa;
  font-family: system-ui, sans-serif;
}
.draft-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #fffefa;
  border-bottom: 1px solid #d5d9ce;
  font-size: 13px;
}
.draft-identity,
.draft-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
button,
select {
  font: inherit;
  cursor: pointer;
  border: 1px solid #b3beaa;
  border-radius: 5px;
  padding: 7px 12px;
  background: #fffefa;
  color: #263f32;
}
button:hover {
  background: #eef2e7;
}
button:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 2px solid #315746;
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
button.primary {
  background: #294b38;
  color: #fffced;
}
.version-switch {
  display: flex;
  gap: 2px;
}
.version-switch button {
  border-color: transparent;
}
.version-switch button[aria-pressed='true'] {
  background: #e8eddc;
  border-color: #d0d8c2;
}
.draft-save-state,
.draft-context {
  font-size: 12px;
  color: #53614b;
}
.draft-context {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 24px;
  background: #f1f2e9;
}
a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.draft-notice {
  padding: 16px 24px;
  background: #fff0d4;
  color: #67420d;
  font-size: 14px;
}
.draft-notice p {
  margin: 6px 0 12px;
}
.draft-empty {
  padding: 56px 24px;
  max-width: 700px;
  margin: auto;
}
.draft-empty h1 {
  font-size: 28px;
}
.field-control {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  font-size: 13px;
}
.field-control input {
  padding: 10px;
  background: #fffef8;
  border: 1px solid #adb99e;
  border-radius: 4px;
  font: inherit;
  color: #263f32;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
.image-controls {
  padding-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
}
.image-controls .field-control {
  width: 100%;
  margin: 0;
}
.field-conflict {
  border-top: 1px solid #d8c6a0;
  margin-top: 16px;
  padding-top: 8px;
}
.conflict-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.conflict-values p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
dialog {
  max-width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  box-sizing: border-box;
  overflow: auto;
  border: 1px solid #b3beaa;
  border-radius: 12px;
  padding: 24px;
  color: #263f32;
  background: #fffefa;
}
dialog::backdrop {
  background: #15271f88;
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
}
.dialog-header h2 {
  margin: 0;
  font-size: 23px;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 20px;
}
.image-grid button {
  min-width: 0;
  padding: 6px;
  text-align: left;
  overflow-wrap: anywhere;
}
.image-grid img {
  width: 100%;
  aspect-ratio: 1.25;
  object-fit: cover;
  display: block;
  margin-bottom: 6px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 700px) {
  .draft-toolbar {
    padding: 10px 16px;
  }
  .draft-actions {
    gap: 8px;
  }
  .draft-save-state {
    flex-basis: 100%;
  }
  .conflict-values {
    grid-template-columns: 1fr;
  }
  .image-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
