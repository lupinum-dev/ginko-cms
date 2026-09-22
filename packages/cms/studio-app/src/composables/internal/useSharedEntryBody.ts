import { useConvex } from '@lupinum/better-convex-vue'
import {
  createEditorCollaboration,
  parseCollaborationRecovery,
  CollaborationConnectionError,
  type EditorCollaborationSession,
  type CollaborationTransport,
  type CollaborationState,
} from '@lupinum/ginko-editor/collaboration'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'

import { api } from '../../boundary/api'
import { useCmsAuthState } from '../useCmsAuthState'
import { isTransientSaveError } from './autosaveRecovery'
import { claimSharedBodyClient } from './sharedBodyClientLock'
import type { StudioAssetContext } from './types'

/** One entry locale and authenticated principal own each mounted session. */
export function useSharedEntryBody(
  context: Ref<StudioAssetContext | undefined>,
  disabled: Ref<boolean>,
) {
  const convex = useConvex()
  const auth = useCmsAuthState()
  const session = shallowRef<EditorCollaborationSession>()
  const state = shallowRef<Readonly<CollaborationState>>()
  let stopState: (() => void) | undefined
  let releaseClient: (() => void) | undefined
  const mode = ref<'loading' | 'local' | 'shared' | 'error'>('loading')
  const error = ref('')
  const recoverySource = ref('')
  const mountKey = ref(0)
  let generation = 0
  let storageKey = ''
  let disposed = false

  const identity = computed(() => {
    const value = context.value
    return value?.entryId && value.locale ? { entryId: value.entryId, locale: value.locale } : null
  })

  async function open() {
    const current = ++generation
    stopState?.()
    session.value?.close()
    releaseClient?.()
    releaseClient = undefined
    session.value = undefined
    state.value = undefined
    mountKey.value++
    error.value = ''
    recoverySource.value = ''
    storageKey = ''
    const body = identity.value
    if (!body || disabled.value || !auth.authEnabled.value) {
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
      const saved = sessionStorage.getItem(key)
      recoverySource.value = saved ?? ''
      const opened = await convex.mutation(api.ginkoCms.editor.openSharedBody, body)
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
        if (!isCurrent()) throw new Error('This editing session has ended.')
        if (!navigator.onLine) throw new CollaborationConnectionError()
        try {
          return await operation()
        } catch (failure) {
          if (!navigator.onLine || isTransientSaveError(failure))
            throw new CollaborationConnectionError()
          throw new Error(
            getCmsErrorMessage(
              failure,
              'The server could not accept this edit. Keep a recovery copy before reopening.',
            ),
            { cause: failure },
          )
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
              if (isCurrent())
                onError(
                  new Error(
                    getCmsErrorMessage(failure, 'This shared body is no longer available.'),
                  ),
                )
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
      const recovery = saved ? parseCollaborationRecovery(saved) : undefined
      const clientId = recovery?.clientId ?? opened.clientPrefix + crypto.randomUUID()
      const release = await claimSharedBodyClient(clientId, Boolean(recovery))
      if (!isCurrent()) {
        release()
        return
      }
      releaseClient = release
      session.value = createEditorCollaboration({
        snapshot: opened.snapshot,
        clientId,
        transport,
        recovery,
        onRecovery(value) {
          // A late acknowledgement from an old principal cannot alter the
          // next session's recovery file or UI.
          if (!isCurrent()) return
          const encoded = value ? JSON.stringify(value) : ''
          if (value) sessionStorage.setItem(key, encoded)
          else sessionStorage.removeItem(key)
          recoverySource.value = encoded
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
      sessionStorage.removeItem(storageKey)
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
    if (!value && mode.value === 'local') void open()
  })
  onScopeDispose(() => {
    disposed = true
    generation++
    stopState?.()
    session.value?.close()
    releaseClient?.()
  })
  return {
    session,
    state,
    mode,
    error,
    recoverySource,
    mountKey,
    ready: computed(() => mode.value === 'local' || mode.value === 'shared'),
    retry: () => (session.value ? session.value.retry() : open()),
    reopen: () =>
      session.value?.getRecovery() || recoverySource.value ? keepRecoveryAndReopen() : open(),
    downloadRecovery,
    keepRecoveryAndReopen,
  }
}
