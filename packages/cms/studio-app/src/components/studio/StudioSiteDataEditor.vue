<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'

import { useCmsI18n } from '../../composables/useCmsI18n'
interface SiteDataSchema {
  type?: string
  [key: string]: unknown
}

interface HoursDayRow {
  day: string
  closed: boolean
  open: string
  close: string
}

const props = defineProps<{
  schema?: SiteDataSchema
  modelValue: Record<string, unknown>
}>()
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()
const { t } = useCmsI18n()
const customJsonError = ref<string | null>(null)
const rawCustomJson = ref(formatJsonValue(props.modelValue))
let ignoreNextCustomJsonSync = false
const blockType = computed(() => props.schema?.type ?? 'custom')
const value = computed({
  get: () => (props.modelValue ?? {}) as Record<string, unknown>,
  set: (nextValue: Record<string, unknown>) => emit('update:modelValue', nextValue),
})
const hoursDays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

function formatJsonValue(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }
  return JSON.stringify(input ?? {}, null, 2)
}

watch(
  () => props.modelValue,
  (nextValue) => {
    if (ignoreNextCustomJsonSync) {
      ignoreNextCustomJsonSync = false
      return
    }
    rawCustomJson.value = formatJsonValue(nextValue)
    customJsonError.value = null
  },
  { deep: true },
)

const hoursRows = computed((): HoursDayRow[] => {
  const days = value.value?.days
  if (Array.isArray(days)) {
    return days as HoursDayRow[]
  }
  return hoursDays.map((day) => ({
    day,
    closed: true,
    open: '',
    close: '',
  }))
})
const listItems = computed(() => {
  const items = value.value?.items
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : []
})
function updateHoursDay(index: number, patch: Partial<HoursDayRow>) {
  const days = Array.isArray(value.value?.days)
    ? [...(value.value.days as HoursDayRow[])]
    : ([] as HoursDayRow[])
  days[index] = {
    ...(days[index] ?? {}),
    day: days[index]?.day ?? hoursDays[index] ?? 'monday',
    closed: days[index]?.closed ?? true,
    open: days[index]?.open ?? '',
    close: days[index]?.close ?? '',
    ...patch,
  }
  value.value = { ...value.value, days }
}
function updateField(field: string, nextValue: unknown) {
  value.value = {
    ...(typeof value.value === 'object' && value.value !== null ? value.value : {}),
    [field]: nextValue,
  }
}
function addListItem() {
  const items = Array.isArray(value.value?.items)
    ? [...(value.value.items as Record<string, unknown>[])]
    : ([] as Record<string, unknown>[])
  items.push(blockType.value === 'text' ? { key: '', value: '' } : { label: '', url: '' })
  value.value = { ...value.value, items }
}
function updateListItem(index: number, patch: Record<string, unknown>) {
  const items = Array.isArray(value.value?.items)
    ? [...(value.value.items as Record<string, unknown>[])]
    : ([] as Record<string, unknown>[])
  items[index] = {
    ...(blockType.value === 'text' ? { key: '', value: '' } : { label: '', url: '' }),
    ...(items[index] ?? {}),
    ...patch,
  }
  value.value = { ...value.value, items }
}
function removeListItem(index: number) {
  const items = Array.isArray(value.value?.items)
    ? [...(value.value.items as Record<string, unknown>[])]
    : ([] as Record<string, unknown>[])
  items.splice(index, 1)
  value.value = { ...value.value, items }
}
function updateCustomJson(nextValue: string) {
  rawCustomJson.value = nextValue
  try {
    const parsed = JSON.parse(nextValue)
    ignoreNextCustomJsonSync = true
    value.value = parsed
    void nextTick(() => {
      ignoreNextCustomJsonSync = false
    })
    customJsonError.value = null
  } catch (error) {
    customJsonError.value = t('ginkoCms.studio.fieldRenderer.invalidJson', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
</script>

<template>
  <div class="ginko:space-y-3">
    <div v-if="blockType === 'hours'" class="ginko:space-y-3">
      <div
        v-for="(day, index) in hoursRows"
        :key="day.day ?? hoursDays[index]"
        class="ginko:grid ginko:grid-cols-[8rem_5rem_1fr_1fr] ginko:gap-3 ginko:items-center ginko:rounded ginko:border ginko:border-border/40 ginko:p-3"
      >
        <div class="ginko:text-sm ginko:font-medium ginko:capitalize">
          {{ day.day ?? hoursDays[index] }}
        </div>
        <label class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-xs">
          <Switch
            :checked="!day.closed"
            @update:checked="updateHoursDay(index, { closed: !$event })"
          />
          {{ t('ginkoCms.studio.siteDataEditor.open') }}
        </label>
        <Input
          :model-value="day.open"
          class="ginko:h-8 ginko:text-xs"
          placeholder="09:00"
          :disabled="day.closed"
          @update:model-value="updateHoursDay(index, { open: $event })"
        />
        <Input
          :model-value="day.close"
          class="ginko:h-8 ginko:text-xs"
          placeholder="17:00"
          :disabled="day.closed"
          @update:model-value="updateHoursDay(index, { close: $event })"
        />
      </div>
    </div>

    <div v-else-if="blockType === 'banner'" class="ginko:space-y-3">
      <label class="ginko:flex ginko:items-center ginko:gap-2 ginko:text-sm">
        <Switch :checked="!!value.enabled" @update:checked="updateField('enabled', $event)" />
        {{ t('ginkoCms.common.enabled') }}
      </label>
      <StudioFieldShell
        for="site-data-banner-message"
        :label="t('ginkoCms.studio.siteDataEditor.message')"
      >
        <Textarea
          id="site-data-banner-message"
          :model-value="value.text ?? ''"
          class="ginko:min-h-[120px]"
          @update:model-value="updateField('text', $event)"
        />
      </StudioFieldShell>
      <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:@3xl:grid-cols-2">
        <StudioFieldShell
          for="site-data-banner-cta-label"
          :label="t('ginkoCms.studio.siteDataEditor.ctaLabel')"
        >
          <Input
            id="site-data-banner-cta-label"
            :model-value="value.ctaLabel ?? ''"
            class="ginko:h-8 ginko:text-xs"
            @update:model-value="updateField('ctaLabel', $event)"
          />
        </StudioFieldShell>
        <StudioFieldShell
          for="site-data-banner-cta-url"
          :label="t('ginkoCms.studio.siteDataEditor.ctaUrl')"
        >
          <Input
            id="site-data-banner-cta-url"
            :model-value="value.ctaUrl ?? ''"
            class="ginko:h-8 ginko:text-xs"
            @update:model-value="updateField('ctaUrl', $event)"
          />
        </StudioFieldShell>
      </div>
      <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:@3xl:grid-cols-2">
        <StudioFieldShell
          for="site-data-banner-starts-at"
          :label="t('ginkoCms.studio.siteDataEditor.startsAt')"
        >
          <Input
            id="site-data-banner-starts-at"
            :model-value="value.startsAt ?? ''"
            type="datetime-local"
            class="ginko:h-8 ginko:text-xs"
            @update:model-value="updateField('startsAt', $event)"
          />
        </StudioFieldShell>
        <StudioFieldShell
          for="site-data-banner-ends-at"
          :label="t('ginkoCms.studio.siteDataEditor.endsAt')"
        >
          <Input
            id="site-data-banner-ends-at"
            :model-value="value.endsAt ?? ''"
            type="datetime-local"
            class="ginko:h-8 ginko:text-xs"
            @update:model-value="updateField('endsAt', $event)"
          />
        </StudioFieldShell>
      </div>
    </div>

    <div v-else-if="blockType === 'links' || blockType === 'text'" class="ginko:space-y-3">
      <div class="ginko:flex ginko:justify-end">
        <Button variant="outline" size="sm" @click="addListItem">
          <Plus class="ginko:size-3.5 ginko:mr-1.5" />
          {{ t('ginkoCms.studio.siteDataEditor.addItem') }}
        </Button>
      </div>
      <div
        v-for="(item, index) in listItems"
        :key="index"
        class="ginko:rounded ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-3"
      >
        <div class="ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:@3xl:grid-cols-2">
          <StudioFieldShell
            :for="`site-data-item-${index}-name`"
            :label="
              blockType === 'text'
                ? t('ginkoCms.studio.siteDataEditor.key')
                : t('ginkoCms.common.label')
            "
          >
            <Input
              :id="`site-data-item-${index}-name`"
              :model-value="blockType === 'text' ? item.key : item.label"
              class="ginko:h-8 ginko:text-xs"
              @update:model-value="
                updateListItem(index, blockType === 'text' ? { key: $event } : { label: $event })
              "
            />
          </StudioFieldShell>
          <StudioFieldShell
            :for="`site-data-item-${index}-value`"
            :label="
              blockType === 'text'
                ? t('ginkoCms.studio.siteDataEditor.value')
                : t('ginkoCms.studio.siteDataEditor.url')
            "
          >
            <Input
              :id="`site-data-item-${index}-value`"
              :model-value="blockType === 'text' ? item.value : item.url"
              class="ginko:h-8 ginko:text-xs"
              @update:model-value="
                updateListItem(index, blockType === 'text' ? { value: $event } : { url: $event })
              "
            />
          </StudioFieldShell>
        </div>
        <div class="ginko:flex ginko:justify-end">
          <Button variant="ghost" size="sm" @click="removeListItem(index)">
            <Trash2 class="ginko:size-3.5 ginko:mr-1.5" />
            {{ t('ginkoCms.common.remove') }}
          </Button>
        </div>
      </div>
    </div>

    <StudioFieldShell
      v-else
      for="site-data-custom-json"
      :label="t('ginkoCms.studio.siteDataEditor.customJson')"
      :error="customJsonError"
    >
      <Textarea
        id="site-data-custom-json"
        :model-value="rawCustomJson"
        :aria-invalid="customJsonError ? true : undefined"
        class="ginko:min-h-[220px] ginko:font-mono ginko:text-sm"
        @update:model-value="updateCustomJson"
      />
    </StudioFieldShell>
  </div>
</template>
