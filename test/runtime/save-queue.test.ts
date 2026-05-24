import { describe, expect, it } from 'vitest'

import { SaveQueue } from '../../packages/cms/studio-app/src/composables/internal/saveQueue'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitFor(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Condition was not met.')
}

describe('SaveQueue', () => {
  it('runs saves serially', async () => {
    const calls: boolean[] = []
    const gate = deferred<boolean>()
    const queue = new SaveQueue(async (silent) => {
      calls.push(silent)
      if (calls.length === 1) {
        return await gate.promise
      }
      return true
    })

    const first = queue.enqueue({ silent: true })
    const second = queue.enqueue({ silent: true })
    expect(calls).toEqual([true])

    gate.resolve(true)
    await Promise.all([first, second])

    expect(calls).toEqual([true, true])
  })

  it('promotes queued work to manual mode when a manual save arrives', async () => {
    const calls: boolean[] = []
    const gate = deferred<boolean>()
    const queue = new SaveQueue(async (silent) => {
      calls.push(silent)
      if (calls.length === 1) {
        return await gate.promise
      }
      return true
    })

    const first = queue.enqueue({ silent: true })
    const second = queue.enqueue({ silent: false })

    gate.resolve(true)
    await Promise.all([first, second])

    expect(calls).toEqual([true, false])
  })

  it('keeps queued manual saves pending until the final queued save drains', async () => {
    const calls: boolean[] = []
    const firstGate = deferred<boolean>()
    const secondGate = deferred<boolean>()
    const queue = new SaveQueue(async (silent) => {
      calls.push(silent)
      if (calls.length === 1) {
        return await firstGate.promise
      }
      if (calls.length === 2) {
        return await secondGate.promise
      }
      return true
    })

    const first = queue.enqueue({ silent: true })
    const manual = queue.enqueue({ silent: false })
    let manualResolved = false
    void manual.then(() => {
      manualResolved = true
    })

    firstGate.resolve(true)
    await waitFor(() => calls.length === 2)

    expect(calls).toEqual([true, false])
    expect(manualResolved).toBe(false)

    secondGate.resolve(true)
    await expect(Promise.all([first, manual])).resolves.toEqual([true, true])
    expect(manualResolved).toBe(true)
  })

  it('drops queued work when the running save fails', async () => {
    const calls: boolean[] = []
    const gate = deferred<boolean>()
    const queue = new SaveQueue(async (silent) => {
      calls.push(silent)
      if (calls.length === 1) {
        return await gate.promise
      }
      return true
    })

    const first = queue.enqueue({ silent: true })
    const second = queue.enqueue({ silent: false })

    gate.resolve(false)
    const results = await Promise.all([first, second])

    expect(results).toEqual([false, false])
    expect(calls).toEqual([true])
  })
})
