import { useConvex } from '@lupinum/better-convex-vue'
import {
  createEditorCollaboration,
  readCollaborationRecovery,
  collaborationRecoveryToMarkdown,
  CollaborationError,
  type CollaborationRecovery,
  CollaborationConnectionError,
  type EditorCollaborationSession,
  type CollaborationState,
} from '@lupinum/ginko-editor/collaboration'
import type { CollaborationTransport } from '@lupinum/ginko-editor/runtime'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'

import { api } from '../../boundary/api'
import { useCmsAuthState } from '../useCmsAuthState'
import { claimSharedBodyClient } from './sharedBodyClientLock'
import { normalizeSharedBodyError } from './sharedBodyErrors'
import {
  readRetainedSharedBodyRecovery,
  retainSharedBodyRecovery,
  writeSharedBodyRecovery,
} from './sharedBodyRecovery'
import type { StudioAssetContext } from './types'

/** One entry locale and authenticated principal own each mounted session. */
export function useSharedEntryBody(
  context: Ref<StudioAssetContext | undefined>,
  disabled: Ref<boolean>,
) {
  const auth = useCmsAuthState()
  const convex = auth.authEnabled.value ? useConvex() : null
  const session = shallowRef<EditorCollaborationSession>()
  const state = shallowRef<Readonly<CollaborationState>>()
  let stopState: (() => void) | undefined
  let releaseClient: (() => void) | undefined
  const mode = ref<'loading' | 'local' | 'shared' | 'error'>('loading')
  const error = ref('')
  const recoverySource = ref('')
  const recoveryMarkdown = ref('')
  let retireRecovery: (() => void) | undefined
  const mountKey = ref(0)
  let generation = 0
  let storageKey = ''
  let disposed = false

  const identity = computed(() => {
    const value = context.value
    return value?.entryId && value.locale ? { entryId: value.entryId, locale: value.locale } : null
  })

  function closeSession() {
    const current = session.value
    if (!current) return
    const recovery = current.getRecovery()
    // Editor.close() always stops transport, even if its recovery write fails.
    // Keep that latest copy outside this retiring component before closing.
    if (!current.flushRecovery() && recovery)
      retainSharedBodyRecovery(storageKey, JSON.stringify(recovery))
    current.close()
  }

  async function open() {
    const current = ++generation
    stopState?.()
    closeSession()
    retireRecovery?.()
    retireRecovery = undefined
    releaseClient?.()
    releaseClient = undefined
    session.value = undefined
    state.value = undefined
    mountKey.value++
    error.value = ''
    recoverySource.value = ''
    recoveryMarkdown.value = ''
    storageKey = ''
    const body = identity.value
    if (!body || !auth.authEnabled.value || !convex) {
      mode.value = 'local'
      return
    }
    mode.value = 'loading'
    if (auth.pending.value) return
    if (!auth.isAuthenticated.value) {
      mode.value = 'error'
      error.value = 'Sign in to open this shared body.'
      return
    }
    const principal = auth.principalKey.value
    const isCurrent = () =>
      !disposed && current === generation && principal === auth.principalKey.value
    const key = `ginko-cms/body-recovery/v1/${encodeURIComponent(principal)}/${body.entryId}/${body.locale}`
    storageKey = key
    try {
      // Storage errors stop the session before typing. Unsent edits must have
      // a durable copy that belongs to this tab and authenticated principal.
      const retained = readRetainedSharedBodyRecovery(key)
      const saved = retained ?? sessionStorage.getItem(key)
      recoverySource.value = saved ?? ''
      if (retained)
        throw new Error(
          'Your latest unsent edits could not be saved to browser storage. They remain only in this tab. Keep it open and download the recovery copy before reopening.',
        )
      if (disabled.value) {
        if (saved)
          throw new Error(
            'Editing is unavailable. Download your unsent recovery copy before reopening.',
          )
        mode.value = 'local'
        return
      }
      const opened = await convex
        .mutation(api.ginkoCms.editor.openSharedBody, body)
        .catch((failure) => {
          throw normalizeSharedBodyError(failure)
        })
      if (!isCurrent()) return
      if (!opened.available) {
        if (saved)
          throw new Error(
            'This body changed while you had unsent edits. Keep the recovery copy before reopening.',
          )
        mode.value = 'local'
        return
      }
      const request = async <T>(operation: () => Promise<T>): Promise<T> => {
        if (!isCurrent())
          throw new CollaborationError('forbidden', 'This editing session has ended.')
        if (!navigator.onLine) throw new CollaborationConnectionError()
        try {
          return await operation()
        } catch (failure) {
          if (!navigator.onLine) throw new CollaborationConnectionError()
          throw normalizeSharedBodyError(failure)
        }
      }
      const transport: CollaborationTransport = {
        subscribe(onHead, onError) {
          const stop = convex.onUpdate(
            api.ginkoCms.editor.getSharedBodyHead,
            body,
            (head) => {
              if (isCurrent()) onHead(head)
            },
            (failure) => {
              if (isCurrent()) onError(normalizeSharedBodyError(failure))
            },
          )
          const offline = () => onError(new CollaborationConnectionError())
          const online = () => {
            if (isCurrent()) session.value?.retry()
          }
          window.addEventListener('offline', offline)
          window.addEventListener('online', online)
          return () => {
            stop()
            window.removeEventListener('offline', offline)
            window.removeEventListener('online', online)
          }
        },
        pull: (head) =>
          request(() => convex.query(api.ginkoCms.editor.pullSharedBody, { ...body, ...head })),
        push: (batch) =>
          request(() => convex.mutation(api.ginkoCms.editor.pushSharedBody, { ...body, ...batch })),
      }
      let recovery: CollaborationRecovery | undefined
      if (saved) {
        const read = await readCollaborationRecovery(saved)
        if (!isCurrent()) return
        if (read.status === 'unreadable') throw new Error(read.message)
        if (read.status === 'converted') {
          recoveryMarkdown.value = read.markdown
          throw new Error(
            'This recovery uses an older editor schema. Keep its JSON and Markdown before reopening; merge it deliberately into the current draft.',
          )
        }
        recovery = read.recovery
        if (
          recovery.base.epoch !== opened.snapshot.epoch ||
          recovery.base.policyRevision !== opened.snapshot.policyRevision
        ) {
          const converted = await collaborationRecoveryToMarkdown(recovery)
          if (!isCurrent()) return
          if (converted.ok) recoveryMarkdown.value = converted.markdown
          throw new Error(
            'This body was replaced while you had unsent edits. Keep the recovery copy before reopening; old operations cannot overwrite the new draft.',
          )
        }
      }
      const clientId = recovery?.clientId ?? opened.clientPrefix + crypto.randomUUID()
      const release = await claimSharedBodyClient(clientId, Boolean(recovery))
      if (!isCurrent()) {
        release()
        return
      }
      releaseClient = release
      // Retiring a principal must first persist its final pending operations
      // under its own key. Later acknowledgements cannot write after close.
      let acceptsRecovery = true
      retireRecovery = () => {
        acceptsRecovery = false
      }
      session.value = createEditorCollaboration({
        snapshot: opened.snapshot,
        clientId,
        transport,
        recovery,
        onRecovery(value) {
          if (!acceptsRecovery) return
          const encoded = value ? JSON.stringify(value) : ''
          try {
            writeSharedBodyRecovery(key, encoded)
          } finally {
            if (isCurrent()) recoverySource.value = encoded
          }
        },
      })
      stopState = session.value.subscribe((value) => {
        state.value = value
      })
      mode.value = 'shared'
    } catch (failure) {
      if (!isCurrent()) return
      releaseClient?.()
      releaseClient = undefined
      mode.value = 'error'
      error.value = getCmsErrorMessage(
        failure,
        'The shared body could not open. Retry when your connection is available.',
      )
    }
  }

  function downloadRecovery() {
    const current = session.value?.getRecovery()
    const source = current ? JSON.stringify(current) : recoverySource.value
    if (!source) return false
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `ginko-body-${identity.value?.locale ?? 'recovery'}-${Date.now()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  }

  function keepRecoveryAndReopen() {
    if (!downloadRecovery()) return
    // The explicit action exports the unsent copy before replacing the local
    // session. Server content is never overwritten by recovery data.
    try {
      // close() flushes one final recovery copy. Retire it before clearing the
      // exported copy so reopening cannot replay the operations just discarded.
      closeSession()
      retireRecovery?.()
      writeSharedBodyRecovery(storageKey, '')
    } catch (failure) {
      error.value = getCmsErrorMessage(failure, 'The recovery copy could not be cleared.')
      return
    }
    void open()
  }

  watch(
    [
      () => identity.value?.entryId,
      () => identity.value?.locale,
      () => auth.principalKey.value,
      () => auth.pending.value,
    ],
    () => {
      void open()
    },
    { immediate: true },
  )
  watch(disabled, (value) => {
    if (value || mode.value === 'local') void open()
  })
  onScopeDispose(() => {
    disposed = true
    generation++
    stopState?.()
    closeSession()
    retireRecovery?.()
    releaseClient?.()
  })
  return {
    session,
    state,
    mode,
    error,
    recoverySource,
    recoveryMarkdown,
    mountKey,
    ready: computed(() => mode.value === 'local' || mode.value === 'shared'),
    retry: () => (session.value ? session.value.retry() : open()),
    reopen: () =>
      session.value?.getRecovery() || recoverySource.value ? keepRecoveryAndReopen() : open(),
    downloadRecovery,
    keepRecoveryAndReopen,
  }
}
