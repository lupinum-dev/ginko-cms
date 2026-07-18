<script setup lang="ts">
import { Copy, Loader2 } from '@lucide/vue'
import {
  resolveEntryTitle,
  resolveTitleFieldKey,
} from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, unref, watch } from 'vue'

import { api } from '../../../boundary/api'
import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useConvexMutation } from '../../../composables/useStudioConvex'
import {
  duplicateSlugCandidate,
  duplicateTitleCandidate,
  isValidDuplicateSlug,
} from '../../../lib/duplicateEntry'

type LocaleDraftForm = {
  locale: string
  selected: boolean
  title: string
  slug: string
}

const open = defineModel<boolean>('open', { default: false })
const editor = useStudioEntryEditorContext()
const duplicateEntry = useConvexMutation(api.ginkoCms.editor.duplicateEntry)
const localeDrafts = ref<LocaleDraftForm[]>([])
const sharedTitle = ref('')
const sharedSlug = ref('')
const pending = ref(false)
const error = ref('')

const entry = computed(() => editor.loader.entry)
const collection = computed(() => editor.loader.collectionConfig)
const titleField = computed(() => {
  const key = resolveTitleFieldKey(
    editor.loader.fields,
    editor.loader.collectionConfig?.settings ?? null,
  )
  return key ? (editor.loader.fields.find((field) => field.key === key) ?? null) : null
})
const localizedTitle = computed(() => titleField.value?.localized === true)
const localizedSlug = computed(() => {
  const mode = collection.value?.routing?.slugMode ?? collection.value?.slugMode ?? 'shared'
  return mode === 'localized' || mode === 'localizedStable'
})
const selectedDrafts = computed(() => localeDrafts.value.filter((draft) => draft.selected))
const canSubmit = computed(() => {
  if (
    pending.value ||
    unref(editor.draft.isDirty) ||
    selectedDrafts.value.length === 0 ||
    collection.value?.routing?.singleton === true ||
    collection.value?.singleton === true
  ) {
    return false
  }
  if (!localizedTitle.value && !sharedTitle.value.trim()) return false
  if (!localizedSlug.value && !isValidDuplicateSlug(sharedSlug.value)) return false
  return selectedDrafts.value.every(
    (draft) =>
      (!localizedTitle.value || draft.title.trim().length > 0) &&
      (!localizedSlug.value || isValidDuplicateSlug(draft.slug)),
  )
})

function initialize() {
  const source = entry.value
  if (!source) return
  const sourceLocales = (source.locales ?? []).filter((locale) => locale.draftExists === true)
  localeDrafts.value = sourceLocales.map((locale) => ({
    locale: locale.locale,
    selected: true,
    title: duplicateTitleCandidate(
      resolveEntryTitle(
        locale.data as JsonMap,
        editor.loader.fields,
        editor.loader.collectionConfig?.settings ?? null,
      ),
    ),
    slug: duplicateSlugCandidate(locale.draftSlug ?? source.baseSlug ?? source.slug),
  }))
  const primary =
    localeDrafts.value.find((locale) => locale.locale === editor.loader.currentLocale) ??
    localeDrafts.value[0]
  sharedTitle.value = primary?.title ?? duplicateTitleCandidate('')
  sharedSlug.value = duplicateSlugCandidate(source.baseSlug ?? source.slug)
  error.value = ''
}

watch(
  () => [open.value, entry.value?._id] as const,
  ([isOpen]) => {
    if (isOpen) initialize()
    else error.value = ''
  },
  { immediate: true },
)

function setOpen(value: boolean) {
  if (pending.value) return
  open.value = value
}

async function submit() {
  const source = entry.value
  if (!source || !canSubmit.value) return
  pending.value = true
  error.value = ''
  const variants = selectedDrafts.value.map((draft) => ({
    locale: draft.locale,
    title: localizedTitle.value ? draft.title.trim() : sharedTitle.value.trim(),
    slug: localizedSlug.value ? draft.slug.trim() : sharedSlug.value.trim(),
  }))
  try {
    const result = await duplicateEntry({
      sourceEntryId: source._id,
      expectedSourceDraftVersion: source.draftVersion,
      variants,
    })
    open.value = false
    const locale = variants[0]!.locale
    await editor.loader.router.push({
      path: `${editor.loader.contentRoute}/${editor.loader.collection}/${result.entryId}`,
      query: locale === editor.loader.defaultLocale ? {} : { locale },
    })
  } catch (cause) {
    error.value = getCmsErrorMessage(
      cause,
      editor.loader.t('ginkoCms.studio.collectionEditor.duplicateError'),
    )
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogContent class="ginko:sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4">
        <StudioNotice
          tone="neutral"
          :description="editor.loader.t('ginkoCms.studio.collectionEditor.duplicateCopyPolicy')"
        />

        <StudioNotice
          v-if="editor.draft.isDirty"
          tone="warning"
          :description="editor.loader.t('ginkoCms.studio.collectionEditor.duplicateSaveFirst')"
        />

        <div v-if="!localizedTitle" class="ginko:space-y-1.5">
          <Label for="duplicate-shared-title">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateNewTitle') }}
          </Label>
          <Input id="duplicate-shared-title" v-model="sharedTitle" autocomplete="off" />
        </div>

        <div v-if="!localizedSlug" class="ginko:space-y-1.5">
          <Label for="duplicate-shared-slug">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateNewSlug') }}
          </Label>
          <Input
            id="duplicate-shared-slug"
            v-model="sharedSlug"
            autocomplete="off"
            class="ginko:font-mono"
          />
        </div>

        <fieldset class="ginko:space-y-2">
          <legend class="ginko:text-sm ginko:font-medium">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateLocales') }}
          </legend>
          <p class="ginko:text-xs ginko:text-muted-foreground">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateLocalesHelp') }}
          </p>
          <div
            v-for="draft in localeDrafts"
            :key="draft.locale"
            class="ginko:rounded-lg ginko:border ginko:border-border ginko:p-3"
          >
            <div class="ginko:flex ginko:items-center ginko:gap-2">
              <Checkbox
                :id="`duplicate-locale-${draft.locale}`"
                :model-value="draft.selected"
                @update:model-value="draft.selected = $event === true"
              />
              <Label :for="`duplicate-locale-${draft.locale}`" class="ginko:flex-1">
                {{ draft.locale.toUpperCase() }}
              </Label>
            </div>
            <div
              v-if="draft.selected && (localizedTitle || localizedSlug)"
              class="ginko:mt-3 ginko:grid ginko:gap-3 ginko:sm:grid-cols-2"
            >
              <div v-if="localizedTitle" class="ginko:space-y-1.5">
                <Label :for="`duplicate-title-${draft.locale}`">
                  {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateNewTitle') }}
                </Label>
                <Input
                  :id="`duplicate-title-${draft.locale}`"
                  v-model="draft.title"
                  autocomplete="off"
                />
              </div>
              <div v-if="localizedSlug" class="ginko:space-y-1.5">
                <Label :for="`duplicate-slug-${draft.locale}`">
                  {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateNewSlug') }}
                </Label>
                <Input
                  :id="`duplicate-slug-${draft.locale}`"
                  v-model="draft.slug"
                  autocomplete="off"
                  class="ginko:font-mono"
                />
              </div>
            </div>
          </div>
        </fieldset>

        <StudioNotice v-if="error" tone="danger" :description="error" />
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="pending" @click="setOpen(false)">
          {{ editor.loader.t('ginkoCms.studio.confirmDialog.cancel') }}
        </Button>
        <Button :disabled="!canSubmit" @click="submit">
          <Loader2 v-if="pending" class="ginko:size-4 ginko:animate-spin" />
          <Copy v-else class="ginko:size-4" />
          {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateConfirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
