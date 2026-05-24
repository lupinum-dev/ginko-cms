import { describe, expect, it, vi } from 'vitest'

import {
  isConcurrentEditError,
  isTransientSaveError,
  OfflineSaveRetry,
} from '../../packages/cms/studio-app/src/composables/internal/autosaveRecovery'

describe('autosave recovery', () => {
  it('classifies concurrent edit errors as terminal conflicts', () => {
    const error = {
      data: {
        code: 'ENTRY_CONCURRENT_EDIT',
        message: 'This entry changed in another session.',
      },
    }

    expect(isConcurrentEditError(error)).toBe(true)
    expect(isTransientSaveError(error)).toBe(false)
  })

  it('classifies network and server failures as retryable', () => {
    expect(isTransientSaveError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientSaveError({ statusCode: 0, message: 'offline' })).toBe(true)
    expect(isTransientSaveError({ statusCode: 503, message: 'unavailable' })).toBe(true)
    expect(isTransientSaveError({ statusCode: 400, message: 'bad request' })).toBe(false)
  })

  it('retries only the latest pending save and clears after success', async () => {
    const retry = new OfflineSaveRetry()
    const task = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    retry.markPending()
    retry.markPending()

    expect(await retry.retry(task)).toBe(false)
    expect(retry.hasPendingRetry).toBe(true)
    expect(await retry.retry(task)).toBe(true)
    expect(retry.hasPendingRetry).toBe(false)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('does not run concurrent reconnect retries', async () => {
    const retry = new OfflineSaveRetry()
    retry.markPending()
    let release!: () => void
    const task = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true)
        }),
    )

    const first = retry.retry(task)
    const second = retry.retry(task)
    release()

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(task).toHaveBeenCalledTimes(1)
  })
})
