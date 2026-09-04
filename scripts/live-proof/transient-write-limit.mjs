const defaultRetryDelaysMs = [250, 500, 1_000, 2_000, 4_000]

function isTransientWriteLimit(error) {
  return error instanceof Error && error.message.includes('"code":"TooManyWrites"')
}

async function wait(milliseconds) {
  await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

export async function retryTransientWriteLimit(
  operation,
  { delaysMs = defaultRetryDelaysMs, waitFor = wait } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const delay = delaysMs[attempt]
      if (delay === undefined || !isTransientWriteLimit(error)) throw error
      await waitFor(delay)
    }
  }
}
