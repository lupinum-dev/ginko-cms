import { computed, ref } from 'vue'

export type StudioPromptRequest = {
  title: string
  description?: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type PendingRequest = StudioPromptRequest & { resolve: (value: string | null) => void }

const queue = ref<PendingRequest[]>([])
const activePromptRequest = computed<PendingRequest | null>(() => queue.value[0] ?? null)

export function studioPrompt(request: StudioPromptRequest): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    queue.value = [...queue.value, { ...request, resolve }]
  })
}

export function useStudioPromptState() {
  function settle(value: string | null) {
    const current = queue.value[0]
    if (!current) return
    queue.value = queue.value.slice(1)
    current.resolve(value)
  }

  return {
    activePromptRequest,
    submit: (value: string) => settle(value),
    cancel: () => settle(null),
  }
}
