<script setup lang="ts">
import { Languages, Loader2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import type { LocaleVariantSource } from '../../../composables/internal/useEntryLocales'
import { useCmsI18n } from '../../../composables/useCmsI18n'

const props = defineProps<{
  open: boolean
  targetLocale: string
  sourceLocales: Array<{ code: string; label?: string }>
  busy: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [source: LocaleVariantSource]
}>()

const { t } = useCmsI18n()
const mode = ref<'blank' | 'locale'>('blank')
const sourceLocale = ref('')
const targetLabel = computed(() => props.targetLocale.toUpperCase())
const canSubmit = computed(
  () => !props.busy && (mode.value === 'blank' || sourceLocale.value.length > 0),
)

function localeLabel(locale: { code: string; label?: string }) {
  return locale.label && locale.label.toLowerCase() !== locale.code.toLowerCase()
    ? `${locale.code.toUpperCase()} · ${locale.label}`
    : locale.code.toUpperCase()
}

watch(
  () => [
    props.open,
    props.targetLocale,
    props.sourceLocales.map((locale) => locale.code).join(','),
  ],
  ([open]) => {
    if (!open) return
    mode.value = 'blank'
    sourceLocale.value = props.sourceLocales[0]?.code ?? ''
  },
  { immediate: true },
)

function setOpen(value: boolean) {
  if (!value && props.busy) return
  emit('update:open', value)
}

function submit() {
  if (!canSubmit.value) return
  emit(
    'confirm',
    mode.value === 'blank' ? { kind: 'blank' } : { kind: 'locale', locale: sourceLocale.value },
  )
}
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogContent class="ginko:sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{
            t('ginkoCms.studio.collectionEditor.createTranslationTitle', {
              locale: targetLabel,
            })
          }}
        </DialogTitle>
        <DialogDescription>
          {{ t('ginkoCms.studio.collectionEditor.createTranslationDescription') }}
        </DialogDescription>
      </DialogHeader>

      <fieldset class="ginko:space-y-3" :disabled="busy">
        <legend class="ginko:mb-2 ginko:text-sm ginko:font-medium">
          {{ t('ginkoCms.studio.collectionEditor.translationStartingContent') }}
        </legend>

        <label
          class="ginko:flex ginko:cursor-pointer ginko:gap-3 ginko:rounded-lg ginko:border ginko:p-3 ginko:transition-colors ginko:has-[:checked]:border-primary ginko:has-[:checked]:bg-primary/5"
        >
          <input
            v-model="mode"
            type="radio"
            name="translation-source-kind"
            value="blank"
            class="ginko:mt-0.5 ginko:size-4 ginko:accent-primary"
          />
          <span>
            <span class="ginko:block ginko:text-sm ginko:font-medium">
              {{ t('ginkoCms.studio.collectionEditor.translationStartBlank') }}
            </span>
            <span class="ginko:mt-0.5 ginko:block ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.collectionEditor.translationStartBlankDescription') }}
            </span>
          </span>
        </label>

        <label
          class="ginko:flex ginko:gap-3 ginko:rounded-lg ginko:border ginko:p-3 ginko:transition-colors ginko:has-[:checked]:border-primary ginko:has-[:checked]:bg-primary/5"
          :class="
            sourceLocales.length > 0
              ? 'ginko:cursor-pointer'
              : 'ginko:cursor-not-allowed ginko:opacity-60'
          "
        >
          <input
            v-model="mode"
            type="radio"
            name="translation-source-kind"
            value="locale"
            class="ginko:mt-0.5 ginko:size-4 ginko:accent-primary"
            :disabled="sourceLocales.length === 0"
          />
          <span class="ginko:min-w-0 ginko:flex-1">
            <span class="ginko:block ginko:text-sm ginko:font-medium">
              {{ t('ginkoCms.studio.collectionEditor.translationCopyExisting') }}
            </span>
            <span class="ginko:mt-0.5 ginko:block ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.collectionEditor.translationCopyExistingDescription') }}
            </span>
          </span>
        </label>

        <div v-if="mode === 'locale'" class="ginko:space-y-1.5 ginko:pl-7">
          <Label for="translation-source-locale">
            {{ t('ginkoCms.studio.collectionEditor.translationSourceLocale') }}
          </Label>
          <select
            id="translation-source-locale"
            v-model="sourceLocale"
            class="ginko:flex ginko:h-8 ginko:w-full ginko:rounded-lg ginko:border ginko:border-input ginko:bg-background ginko:px-2.5 ginko:text-sm ginko:outline-none ginko:focus-visible:border-ring ginko:focus-visible:ring-3 ginko:focus-visible:ring-ring/50"
            required
          >
            <option v-for="locale in sourceLocales" :key="locale.code" :value="locale.code">
              {{ localeLabel(locale) }}
            </option>
          </select>
        </div>
      </fieldset>

      <StudioNotice
        tone="neutral"
        :description="t('ginkoCms.studio.collectionEditor.translationSharedUnaffected')"
      />

      <DialogFooter>
        <Button variant="outline" :disabled="busy" @click="setOpen(false)">
          {{ t('ginkoCms.studio.confirmDialog.cancel') }}
        </Button>
        <Button :disabled="!canSubmit" @click="submit">
          <Loader2 v-if="busy" class="ginko:size-4 ginko:animate-spin" aria-hidden="true" />
          <Languages v-else class="ginko:size-4" aria-hidden="true" />
          {{ t('ginkoCms.studio.collectionEditor.createTranslationConfirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
