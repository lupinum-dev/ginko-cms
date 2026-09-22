<script setup lang="ts">
import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionReturnType } from 'convex/server'
import { computed, ref, toRaw, useId, watch } from 'vue'

import { api } from '../../../boundary/api'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'
import { useConvexMutation } from '../../../composables/useStudioConvex'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'
import { fieldDisplayLabel, humanizeFieldKey } from '../../../lib/fieldLabel'

type Review = FunctionReturnType<typeof api.ginkoCms.editor.getTranslationReview>
const props = defineProps<{
  entryId: string
  targetLocale: string
  localeOptions: Array<{ code: string; label: string }>
  fields?: Array<{ key: string; label?: unknown }>
  flushPending: () => Promise<boolean>
}>()
const { t, dateLocale, currentLocale } = useCmsI18n()
const text = (key: string) => t(`ginkoCms.studio.translationReview.${key}`)
const sourceInputId = useId()
const query = useCmsStudioQuery(
  api.ginkoCms.editor.getTranslationReview,
  computed(() => ({ entryId: props.entryId, targetLocale: props.targetLocale })),
  { keepPreviousData: false },
)
const setSource = useConvexMutation(api.ginkoCms.editor.setTranslationSource)
const acknowledge = useConvexMutation(api.ginkoCms.editor.acknowledgeTranslationReview)
const reviewing = ref<Review | null>(null)
const pending = ref(false)
const error = ref('')
const state = query.data
const selectedSource = computed(() =>
  state.value?.status === 'unknown' ? '' : (state.value?.sourceLocale ?? '__independent__'),
)
const stale = computed(() =>
  Boolean(
    reviewing.value &&
    state.value &&
    (reviewing.value.reviewId !== state.value.reviewId ||
      reviewing.value.sourceDraftId !== state.value.sourceDraftId ||
      reviewing.value.targetDraftId !== state.value.targetDraftId ||
      reviewing.value.sourceVersion !== state.value.sourceVersion ||
      reviewing.value.targetVersion !== state.value.targetVersion ||
      reviewing.value.sharedVersion !== state.value.sharedVersion),
  ),
)
const reviewFields = computed(() => {
  const review = reviewing.value
  const source = review?.source
  if (!review || !source) return []
  const changes = [...new Set([...review.changedFields, ...review.changedTargetFields])]
  if (changes.length) return changes
  const values = [
    ...new Set([...Object.keys(source.values), ...Object.keys(review.target.values)]),
  ].map((key) => `values.${key}`)
  if (source.bodyMdc || review.target.bodyMdc) values.push('bodyMdc')
  return values
})
function fieldValue(snapshot: Review['source'], path: string): string {
  if (!snapshot) return text('empty')
  let value: JsonValue | undefined
  if (path.startsWith('values.')) value = snapshot.values[path.slice(7)]
  else if (path.startsWith('shared.')) value = snapshot.shared[path.slice(7)]
  else value = path === 'bodyMdc' ? snapshot.bodyMdc : snapshot.slug
  return value == null || value === ''
    ? text('empty')
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
}
function fieldLabel(path: string) {
  if (path === 'bodyMdc') return text('body')
  if (path === 'slug') return text('slug')
  const key = path.replace(/^(values|shared)\./, '')
  const field = props.fields?.find((candidate) => candidate.key === key)
  return field ? fieldDisplayLabel(field, currentLocale.value) : humanizeFieldKey(key)
}
function fence(review: Review) {
  return {
    entryId: review.entryId,
    targetLocale: review.targetLocale,
    expectedTargetVersion: review.targetVersion,
    expectedTargetDraftId: review.targetDraftId,
    expectedSharedVersion: review.sharedVersion,
    expectedReviewId: review.reviewId,
  }
}
async function prepare() {
  const identity = `${props.entryId}:${props.targetLocale}`
  if (!(await props.flushPending())) {
    error.value = text('saveFirst')
    return false
  }
  await query.refresh()
  return identity === `${props.entryId}:${props.targetLocale}` && Boolean(state.value)
}
async function changeSource(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLSelectElement)) return
  const selection = input.value
  const inspected = state.value
  if (!selection || !inspected || !inspected._can.edit || pending.value) return
  // A save flush may reveal another person's source choice or review. Keep the
  // relationship fence the user acted on rather than adopting that newer choice.
  const identity = { entryId: inspected.entryId, targetLocale: inspected.targetLocale }
  const expectedReviewId = inspected.reviewId
  pending.value = true
  error.value = ''
  try {
    if (!(await prepare()) || !state.value) return
    if (
      state.value.entryId !== identity.entryId ||
      state.value.targetLocale !== identity.targetLocale ||
      state.value.reviewId !== expectedReviewId
    ) {
      error.value = text('stale')
      return
    }
    await setSource({
      ...fence(state.value),
      expectedReviewId,
      sourceLocale: selection === '__independent__' ? null : selection,
    })
    reviewing.value = null
  } catch (cause) {
    error.value = getCmsErrorMessage(cause, text('failed'))
  } finally {
    // A rejected native select change must show the saved relationship again.
    input.value = selectedSource.value
    pending.value = false
  }
}
async function startReview() {
  pending.value = true
  error.value = ''
  try {
    if ((await prepare()) && state.value) reviewing.value = structuredClone(toRaw(state.value))
  } catch (cause) {
    error.value = getCmsErrorMessage(cause, text('failed'))
  } finally {
    pending.value = false
  }
}
async function confirmReview() {
  const review = reviewing.value
  if (
    !review ||
    review.sourceVersion === null ||
    review.sourceDraftId === null ||
    stale.value ||
    pending.value
  )
    return
  pending.value = true
  error.value = ''
  try {
    // Keep the versions the person actually inspected. A flush must never silently
    // replace their review with newer source or target text.
    if (!(await prepare())) return
    if (stale.value) {
      error.value = text('stale')
      return
    }
    await acknowledge({
      ...fence(review),
      expectedSourceVersion: review.sourceVersion,
      expectedSourceDraftId: review.sourceDraftId,
    })
    reviewing.value = null
  } catch (cause) {
    error.value = getCmsErrorMessage(cause, text('failed'))
  } finally {
    pending.value = false
  }
}
watch(
  () => [props.entryId, props.targetLocale],
  () => {
    reviewing.value = null
    error.value = ''
  },
)
</script>

<template>
  <section class="ginko:space-y-4" :aria-label="text('title')" :aria-busy="pending">
    <p v-if="query.error.value" role="alert" class="ginko:text-sm ginko:text-destructive">
      {{ text('failed') }}
    </p>
    <p v-else-if="!state" role="status" class="ginko:text-sm ginko:text-muted-foreground">
      {{ text('loading') }}
    </p>
    <template v-else>
      <div class="ginko:space-y-2">
        <label :for="sourceInputId" class="ginko:block ginko:text-sm ginko:font-medium">{{
          text('source')
        }}</label>
        <select
          :id="sourceInputId"
          :value="selectedSource"
          :disabled="pending || !state._can.edit"
          class="ginko:w-full ginko:rounded-md ginko:border ginko:border-input ginko:bg-background ginko:p-2 ginko:text-sm"
          @change="changeSource"
        >
          <option value="" disabled>{{ text('chooseSource') }}</option>
          <option value="__independent__">{{ text('independent') }}</option>
          <option
            v-for="locale in localeOptions.filter((item) => item.code !== targetLocale)"
            :key="locale.code"
            :value="locale.code"
          >
            {{ contentLanguageLabel(locale.code, localeOptions, dateLocale) }}
          </option>
        </select>
      </div>
      <p role="status" class="ginko:text-sm ginko:text-muted-foreground">
        {{
          text(
            state.status === 'unknown'
              ? 'unknown'
              : state.status === 'independent'
                ? 'independentHint'
                : state.status === 'reviewed'
                  ? 'reviewed'
                  : state.reason === 'source-missing'
                    ? 'noSource'
                    : 'needsReview',
          )
        }}
      </p>
      <button
        v-if="state.source && !reviewing"
        type="button"
        :disabled="pending"
        class="ginko:rounded-md ginko:border ginko:px-3 ginko:py-2 ginko:text-sm"
        @click="startReview"
      >
        {{ text('start') }}
      </button>
      <div v-if="reviewing" class="ginko:space-y-4">
        <p v-if="stale" role="alert" class="ginko:text-sm ginko:text-destructive">
          {{ text('stale') }}
        </p>
        <p
          v-if="reviewing.changedFields.length === 0"
          class="ginko:text-sm ginko:text-muted-foreground"
        >
          {{ text('unchanged') }}
        </p>
        <div
          v-for="field in reviewFields"
          :key="field"
          class="ginko:space-y-2 ginko:border-t ginko:pt-3"
        >
          <h4 class="ginko:text-sm ginko:font-semibold ginko:capitalize">
            {{ fieldLabel(field) }}
          </h4>
          <dl class="ginko:space-y-2 ginko:text-sm">
            <template v-if="reviewing.reviewedSource && reviewing.changedFields.includes(field)">
              <dt class="ginko:text-xs ginko:text-muted-foreground">{{ text('before') }}</dt>
              <dd
                class="ginko:max-h-48 ginko:overflow-auto ginko:whitespace-pre-wrap ginko:break-words"
              >
                {{ fieldValue(reviewing.reviewedSource, field) }}
              </dd>
            </template>
            <dt class="ginko:text-xs ginko:text-muted-foreground">{{ text('now') }}</dt>
            <dd
              class="ginko:max-h-48 ginko:overflow-auto ginko:whitespace-pre-wrap ginko:break-words"
            >
              {{ fieldValue(reviewing.source, field) }}
            </dd>
            <dt class="ginko:text-xs ginko:text-muted-foreground">{{ text('target') }}</dt>
            <dd
              class="ginko:max-h-48 ginko:overflow-auto ginko:whitespace-pre-wrap ginko:break-words"
            >
              {{ fieldValue(reviewing.target, field) }}
            </dd>
          </dl>
        </div>
        <button
          v-if="stale"
          type="button"
          :disabled="pending"
          class="ginko:rounded-md ginko:border ginko:px-3 ginko:py-2 ginko:text-sm"
          @click="startReview"
        >
          {{ text('restart') }}
        </button>
        <button
          v-else-if="state._can.edit"
          type="button"
          :disabled="pending || !reviewing.source"
          class="ginko:rounded-md ginko:bg-primary ginko:px-3 ginko:py-2 ginko:text-sm ginko:text-primary-foreground"
          @click="confirmReview"
        >
          {{ text('confirm') }}
        </button>
      </div>
    </template>
    <p v-if="error" role="alert" class="ginko:text-sm ginko:text-destructive">{{ error }}</p>
  </section>
</template>
