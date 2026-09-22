<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  value: string
  label: string
  editing: boolean
  multiline?: boolean
}>()
const emit = defineEmits<{ change: [value: string]; composition: [active: boolean] }>()
const control = ref<HTMLTextAreaElement | null>(null)

function resize() {
  if (!control.value) return
  control.value.style.height = 'auto'
  control.value.style.height = `${control.value.scrollHeight}px`
}

function input(event: Event) {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  emit('change', event.target.value)
  resize()
}

watch(
  () => [props.value, props.editing],
  async () => {
    await nextTick()
    resize()
  },
)
onMounted(resize)
</script>

<template>
  <textarea
    v-if="editing"
    ref="control"
    class="landing-text-control"
    :aria-label="label"
    :value="value"
    :placeholder="label"
    rows="1"
    :maxlength="multiline ? 2000 : 240"
    @input="input"
    @keydown.enter="!multiline && !$event.isComposing && $event.preventDefault()"
    @compositionstart="emit('composition', true)"
    @compositionend="emit('composition', false)"
  />
  <span v-else>{{ value }}</span>
</template>

<style scoped>
.landing-text-control {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 1em;
  padding: 0;
  border: 0;
  border-radius: 3px;
  resize: none;
  overflow: hidden;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  outline: 1px dashed #73836a;
  outline-offset: 7px;
}
.landing-text-control:focus {
  outline: 2px solid #315746;
}
.landing-text-control::placeholder {
  color: #777e70;
}
</style>
