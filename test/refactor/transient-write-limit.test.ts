import { describe, expect, it, vi } from 'vitest'

import { retryTransientWriteLimit } from '../../scripts/live-proof/transient-write-limit.mjs'

const writeLimitError = () => new Error('{"code":"TooManyWrites","message":"slow down"}')

describe('local certification write throttling', () => {
  it('retries only explicit write-limit responses with bounded delays', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(writeLimitError())
      .mockRejectedValueOnce(writeLimitError())
      .mockResolvedValue('ready')
    const waitFor = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(
      retryTransientWriteLimit(operation, { delaysMs: [10, 20], waitFor }),
    ).resolves.toBe('ready')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(waitFor.mock.calls).toEqual([[10], [20]])
  })

  it('fails immediately for unrelated errors', async () => {
    const error = new Error('permission denied')
    const waitFor = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(
      retryTransientWriteLimit(async () => await Promise.reject(error), {
        delaysMs: [10],
        waitFor,
      }),
    ).rejects.toBe(error)
    expect(waitFor).not.toHaveBeenCalled()
  })

  it('fails after the bounded retry budget is exhausted', async () => {
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(writeLimitError())
    const waitFor = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(
      retryTransientWriteLimit(operation, { delaysMs: [10, 20], waitFor }),
    ).rejects.toThrow(/TooManyWrites/)
    expect(operation).toHaveBeenCalledTimes(3)
    expect(waitFor.mock.calls).toEqual([[10], [20]])
  })
})
