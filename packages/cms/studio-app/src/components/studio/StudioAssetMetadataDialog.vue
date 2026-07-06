<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { File, Loader2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import type { StudioAssetContext, StudioAssetRecord } from '../../composables/internal/types'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useConvexMutation } from '../../composables/useStudioConvex'

const props = defineProps<{
  assetContext?: StudioAssetContext
  assetId: string | null
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useCmsI18n()
const studioSettings = useCmsStudioSettings()
const updateAsset = useConvexMutation(api.ginkoCms.assets.updateAsset)
const activeLocale = ref('')
const altDrafts = ref<Record<string, string>>({})
const captionDrafts = ref<Record<string, string>>({})
const saving = ref(false)
const error = ref('')

const assetQuery = useCmsStudioQuery(
  api.ginkoCms.assets.getAsset,
  computed(() => (props.assetId ? { assetId: props.assetId } : null)),
)

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const selectedAsset = computed<StudioAssetRecord | null>(() => {
  const rawAsset = assetQuery.data?.value as
    | (StudioAssetRecord & {
        id?: string
      })
    | Array<
        StudioAssetRecord & {
          id?: string
        }
      >
    | null
    | undefined
  const asset = Array.isArray(rawAsset)
    ? rawAsset.find(
        (candidate) => candidate._id === props.assetId || candidate.id === props.assetId,
      )
    : rawAsset
  if (!asset) return null
  return {
    ...asset,
    _id: asset._id ?? asset.id ?? props.assetId ?? '',
  }
})

const localeOptions = computed(() => {
  const configured = studioSettings.locales.value.map((locale) => ({
    code: locale.code,
    label: locale.label || locale.code,
    isDefault: locale.code === studioSettings.defaultLocale.value,
  }))
  const preferredCodes = [
    props.assetContext?.locale,
    studioSettings.defaultLocale.value,
    configured[0]?.code,
    'en',
  ].filter((code): code is string => !!code)

  const byCode = new Map(configured.map((locale) => [locale.code, locale]))
  for (const code of preferredCodes) {
    if (!byCode.has(code)) byCode.set(code, { code, label: code, isDefault: false })
  }
  return Array.from(byCode.values())
})

const preferredLocale = computed(
  () => props.assetContext?.locale ?? studioSettings.defaultLocale.value ?? 'en',
)

const altText = computed({
  get: () => altDrafts.value[activeLocale.value] ?? '',
  set: (value: string) => {
    altDrafts.value = { ...altDrafts.value, [activeLocale.value]: value }
  },
})

const captionText = computed({
  get: () => captionDrafts.value[activeLocale.value] ?? '',
  set: (value: string) => {
    captionDrafts.value = { ...captionDrafts.value, [activeLocale.value]: value }
  },
})

watch(
  [selectedAsset, preferredLocale],
  ([asset, locale]) => {
    error.value = ''
    if (!asset) {
      altDrafts.value = {}
      captionDrafts.value = {}
      activeLocale.value = locale
      return
    }
    altDrafts.value = localeTextToDrafts(asset.alt)
    captionDrafts.value = localeTextToDrafts(asset.caption)
    activeLocale.value = localeOptions.value.some((option) => option.code === locale)
      ? locale
      : (localeOptions.value[0]?.code ?? 'en')
  },
  { immediate: true },
)

function localeTextToDrafts(value: StudioAssetRecord['alt'] | StudioAssetRecord['caption']) {
  if (typeof value === 'string') return { [studioSettings.defaultLocale.value ?? 'en']: value }
  if (!value || typeof value !== 'object') return {}
  return { ...value }
}

function mergeLocaleText(
  existing: StudioAssetRecord['alt'] | StudioAssetRecord['caption'],
  drafts: Record<string, string>,
) {
  return {
    ...(typeof existing === 'object' && existing !== null ? existing : {}),
    ...drafts,
  }
}

async function saveMetadata() {
  if (!selectedAsset.value) return
  saving.value = true
  error.value = ''
  try {
    await updateAsset({
      assetId: selectedAsset.value._id,
      alt: mergeLocaleText(selectedAsset.value.alt, altDrafts.value),
      caption: mergeLocaleText(selectedAsset.value.caption, captionDrafts.value),
    })
    open.value = false
  } catch (cause) {
    error.value = getCmsErrorMessage(cause, t('ginkoCms.studio.assetPicker.saveMetadataError'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="open = $event">
    <DialogContent size="sm" class="ginko:gap-0 ginko:overflow-hidden ginko:p-0">
      <DialogHeader class="ginko:border-b ginko:px-5 ginko:py-4 ginko:pr-12">
        <DialogTitle>Edit image metadata</DialogTitle>
        <DialogDescription>
          Update asset-library metadata. Published entries keep their current snapshot until they
          are republished.
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4 ginko:p-5">
        <div v-if="selectedAsset" class="ginko:flex ginko:gap-3">
          <div
            class="ginko:flex ginko:size-20 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40"
          >
            <img
              v-if="selectedAsset.mimeType.startsWith('image/') && selectedAsset.url"
              :src="selectedAsset.url"
              :alt="selectedAsset.filename"
              class="ginko:h-full ginko:w-full ginko:object-cover"
            />
            <File v-else class="ginko:size-8 ginko:text-muted-foreground" />
          </div>
          <div class="ginko:min-w-0 ginko:space-y-1 ginko:pt-1">
            <div class="ginko:truncate ginko:text-sm ginko:font-medium">
              {{ selectedAsset.filename }}
            </div>
            <div class="ginko:text-xs ginko:text-muted-foreground">
              {{ selectedAsset.mimeType }}
            </div>
            <div v-if="selectedAsset.width" class="ginko:text-xs ginko:text-muted-foreground">
              {{ selectedAsset.width }} x {{ selectedAsset.height }}
            </div>
          </div>
        </div>

        <div
          v-else
          class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2 ginko:text-sm ginko:text-muted-foreground"
        >
          Asset metadata is not available.
        </div>

        <div class="ginko:space-y-1.5">
          <Label class="ginko:text-xs">Locale</Label>
          <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
            <button
              v-for="locale in localeOptions"
              :key="locale.code"
              type="button"
              class="ginko:inline-flex ginko:h-7 ginko:items-center ginko:gap-1 ginko:rounded-md ginko:px-2 ginko:text-xs ginko:transition-colors"
              :class="
                activeLocale === locale.code
                  ? 'ginko:bg-accent ginko:font-medium ginko:text-foreground'
                  : 'ginko:text-muted-foreground ginko:hover:bg-muted/60 ginko:hover:text-foreground'
              "
              @click="activeLocale = locale.code"
            >
              <span class="ginko:font-mono ginko:uppercase">{{ locale.code }}</span>
              <span v-if="locale.label !== locale.code" class="ginko:max-w-24 ginko:truncate">{{
                locale.label
              }}</span>
              <span v-if="locale.isDefault" class="ginko:text-xs ginko:text-muted-foreground">
                default
              </span>
            </button>
          </div>
        </div>

        <div
          v-if="error"
          class="ginko:rounded-md ginko:bg-destructive/10 ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-destructive-fg"
        >
          {{ error }}
        </div>

        <div class="ginko:space-y-3">
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs">Alt Text</Label>
            <Input
              v-model="altText"
              class="ginko:h-9 ginko:text-sm"
              :disabled="!selectedAsset || saving"
            />
          </div>
          <div class="ginko:space-y-1.5">
            <Label class="ginko:text-xs">Caption</Label>
            <Input
              v-model="captionText"
              class="ginko:h-9 ginko:text-sm"
              :disabled="!selectedAsset || saving"
            />
          </div>
        </div>
      </div>

      <DialogFooter class="ginko:border-t ginko:px-5 ginko:py-3">
        <Button variant="outline" size="sm" :disabled="saving" @click="open = false">
          Cancel
        </Button>
        <Button size="sm" :disabled="!selectedAsset || saving" @click="saveMetadata">
          <Loader2 v-if="saving" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
