<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useStudioPromptState } from '../../composables/internal/useStudioPrompt'
import { useCmsI18n } from '../../composables/useCmsI18n'

const { activePromptRequest, submit, cancel } = useStudioPromptState()
const { t } = useCmsI18n()
const open = computed(() => activePromptRequest.value !== null)
const value = ref('')
const input = ref<{ focus: () => void; select: () => void } | null>(null)

watch(
  activePromptRequest,
  async (request) => {
    value.value = request?.defaultValue ?? ''
    if (!request) return
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
  { immediate: true },
)

function onUpdateOpen(nextOpen: boolean) {
  if (!nextOpen) cancel()
}

function onSubmit() {
  submit(value.value.trim())
}
</script>

<template>
  <Dialog :open="open" @update:open="onUpdateOpen">
    <DialogContent v-if="activePromptRequest" class="ginko:sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ activePromptRequest.title }}</DialogTitle>
        <DialogDescription v-if="activePromptRequest.description">
          {{ activePromptRequest.description }}
        </DialogDescription>
      </DialogHeader>

      <form class="ginko:space-y-3" @submit.prevent="onSubmit">
        <Label v-if="activePromptRequest.label" for="ginko-studio-global-prompt-input">
          {{ activePromptRequest.label }}
        </Label>
        <Input
          id="ginko-studio-global-prompt-input"
          ref="input"
          v-model="value"
          :placeholder="activePromptRequest.placeholder"
        />

        <DialogFooter>
          <Button type="button" variant="outline" @click="cancel">
            {{ activePromptRequest.cancelLabel ?? t('ginkoCms.studio.confirmDialog.cancel') }}
          </Button>
          <Button type="submit">
            {{ activePromptRequest.confirmLabel ?? t('ginkoCms.studio.confirmDialog.confirm') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
