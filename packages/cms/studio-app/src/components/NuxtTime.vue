<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  datetime: Date | number | string
  locale?: string
  year?: Intl.DateTimeFormatOptions['year']
  month?: Intl.DateTimeFormatOptions['month']
  day?: Intl.DateTimeFormatOptions['day']
  hour?: Intl.DateTimeFormatOptions['hour']
  minute?: Intl.DateTimeFormatOptions['minute']
  second?: Intl.DateTimeFormatOptions['second']
}>()

const date = computed(() => new Date(props.datetime))
const isoDate = computed(() =>
  Number.isNaN(date.value.getTime()) ? undefined : date.value.toISOString(),
)
const formatted = computed(() => {
  if (Number.isNaN(date.value.getTime())) return ''

  return new Intl.DateTimeFormat(props.locale, {
    year: props.year,
    month: props.month,
    day: props.day,
    hour: props.hour,
    minute: props.minute,
    second: props.second,
  }).format(date.value)
})
</script>

<template>
  <time :datetime="isoDate">{{ formatted }}</time>
</template>
