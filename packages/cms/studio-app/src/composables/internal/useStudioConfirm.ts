import { computed, ref } from 'vue'

export type StudioConfirmRequest = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive'
}

type PendingRequest = StudioConfirmRequest & { resolve: (ok: boolean) => void }

/**
 * Per Gate -1: dangerous flows (publish, unpublish, archive, history restore)
 * previously used `window.confirm`, which is not appropriate for a CMS — no
 * styling, no reusable surface, no consistency with the rest of Studio. This
 * Promise-based composable lets callers in `.ts` files request a confirmation
 * dialog without owning Vue template state. A single `<StudioGlobalConfirm>`
 * mounted at the Studio app root renders the front of the queue.
 *
 * Requests are FIFO: if a confirm fires while another is open, it waits in
 * line. Each caller's promise resolves exactly once with the user's answer.
 */
const queue = ref<PendingRequest[]>([])
const activeRequest = computed<PendingRequest | null>(() => queue.value[0] ?? null)

export function studioConfirm(request: StudioConfirmRequest): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    queue.value = [...queue.value, { ...request, resolve }]
  })
}

export function useStudioConfirmState() {
  function settle(answer: boolean) {
    const current = queue.value[0]
    if (!current) return
    queue.value = queue.value.slice(1)
    current.resolve(answer)
  }
  return {
    activeRequest,
    confirm: () => settle(true),
    cancel: () => settle(false),
  }
}
