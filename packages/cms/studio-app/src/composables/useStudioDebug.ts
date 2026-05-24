import { watch } from 'vue'
import type { Router } from 'vue-router'

import { useCmsConfig } from './useCmsConfig'

type StudioLogPayload = Record<string, unknown> | undefined

// Studio-side debug logger scoped to the explicit host bridge config.
export function useStudioDebug(scope: string) {
  const config = useCmsConfig()
  const enabled = config.debugStudio ?? import.meta.env.DEV

  function log(level: 'debug' | 'warn' | 'error', message: string, payload?: StudioLogPayload) {
    if (!enabled) return

    const prefix = `[ginko-cms][studio][${scope}] ${message}`

    if (payload) {
      console[level](prefix, payload)
      return
    }

    console[level](prefix)
  }

  function logQueryError(name: string, error: unknown, payload?: StudioLogPayload) {
    log('error', `${name} query failed`, {
      ...payload,
      error,
    })
  }

  async function pushWithLogging(
    router: Router,
    to: string,
    reason: string,
    payload?: StudioLogPayload,
  ) {
    log('debug', `navigate:start:${reason}`, { to, ...payload })

    try {
      await router.push(to)
      log('debug', `navigate:success:${reason}`, { to, ...payload })
    } catch (error) {
      log('error', `navigate:error:${reason}`, {
        to,
        ...payload,
        error,
      })
      throw error
    }
  }

  function watchQueryError(
    name: string,
    source: { error?: { value: unknown } } | null | undefined,
    payload?: StudioLogPayload,
  ) {
    watch(
      () => source?.error?.value,
      (error) => {
        if (!error) return
        logQueryError(name, error, payload)
      },
      { immediate: true },
    )
  }

  return {
    debug(message: string, payload?: StudioLogPayload) {
      log('debug', message, payload)
    },
    warn(message: string, payload?: StudioLogPayload) {
      log('warn', message, payload)
    },
    error(message: string, payload?: StudioLogPayload) {
      log('error', message, payload)
    },
    logQueryError,
    pushWithLogging,
    watchQueryError,
  }
}
