type SaveTask = (silent: boolean) => Promise<boolean>

/**
 * Serializes save work and coalesces concurrent requests into at most one
 * follow-up run. Manual saves promote queued work out of silent mode.
 */
export class SaveQueue {
  private running: Promise<boolean> | null = null
  private queued = false
  private queuedManual = false

  constructor(private readonly task: SaveTask) {}

  get active() {
    return this.running !== null
  }

  async enqueue(options: { silent: boolean }) {
    if (this.running) {
      this.queued = true
      this.queuedManual = this.queuedManual || !options.silent
      return await this.running
    }

    const loop = async () => {
      let silent = options.silent

      while (true) {
        this.queued = false
        const succeeded = await this.task(silent)
        if (!succeeded || !this.queued) {
          return succeeded
        }

        silent = !this.queuedManual
        this.queuedManual = false
      }
    }

    this.running = loop().finally(() => {
      this.running = null
      this.queuedManual = false
    })

    return await this.running
  }
}
