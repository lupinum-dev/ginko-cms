// Tab-lifetime fallback for a failed durable write. Keys include the original
// authenticated principal, entry and locale; a new principal never inherits it.
const retained = new Map<string, string>()

function preventRecoveryLoss(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

export function retainSharedBodyRecovery(key: string, source: string) {
  retained.set(key, source)
  window.addEventListener('beforeunload', preventRecoveryLoss)
}

export function readRetainedSharedBodyRecovery(key: string) {
  return retained.get(key)
}

/** Throws when persistence fails, while preserving the latest copy in this tab. */
export function writeSharedBodyRecovery(key: string, source: string) {
  try {
    if (source) sessionStorage.setItem(key, source)
    else sessionStorage.removeItem(key)
    retained.delete(key)
    if (retained.size === 0) window.removeEventListener('beforeunload', preventRecoveryLoss)
  } catch (failure) {
    retainSharedBodyRecovery(key, source)
    throw failure
  }
}
