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

export type ArchivedSharedBodyRecovery = { key: string; source: string }

/** Export attempts are copies, not proof the browser saved a file. Never replay these. */
export function archiveSharedBodyRecovery(key: string, source: string) {
  if (readArchivedSharedBodyRecoveries(key).some((copy) => copy.source === source)) return
  const archiveKey = `${key}/export/${crypto.randomUUID()}`
  writeSharedBodyRecovery(archiveKey, source)
}

export function readArchivedSharedBodyRecoveries(key: string): ArchivedSharedBodyRecovery[] {
  const prefix = `${key}/export/`
  const copies = new Map<string, string>()
  for (let index = 0; index < sessionStorage.length; index++) {
    const storedKey = sessionStorage.key(index)
    if (storedKey?.startsWith(prefix)) {
      const source = sessionStorage.getItem(storedKey)
      if (source) copies.set(storedKey, source)
    }
  }
  for (const [retainedKey, source] of retained)
    if (retainedKey.startsWith(prefix) && source) copies.set(retainedKey, source)
  return [...copies].map(([key, source]) => ({ key, source }))
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
