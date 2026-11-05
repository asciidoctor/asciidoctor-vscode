export interface RenderSchedulerOptions {
  // Renders the latest state of the document. Never called twice at the same
  // time.
  render: () => Promise<void>
  // Minimum time, in milliseconds, between the end of a render and the start
  // of the next one triggered by an edit.
  minDelay: () => number
  // The time left after a render is at least `factor` times its duration, so
  // that a slow document is rendered less often and leaves the extension host
  // available to other work most of the time.
  factor?: number
  // Upper bound of the delay computed from the duration of the last render.
  // `minDelay` wins when it is greater.
  maxDelay?: number
  now?: () => number
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  onError?: (error: unknown) => void
}

/**
 * Decides when the preview renders the document it displays.
 *
 * - The first edit after a quiet period renders immediately.
 * - While the user keeps typing, the edits are coalesced: a render always uses
 *   the latest version of the document, and the next one starts at least
 *   `max(minDelay, factor × duration of the last render)` after the previous
 *   one ended.
 * - Only one render runs at a time. The conversion is async but runs on the
 *   extension host thread and cannot be cancelled, so two concurrent renders
 *   would compete for that thread and could finish out of order.
 * - The last edit is always rendered.
 */
export class RenderScheduler {
  private readonly factor: number
  private readonly maxDelay: number
  private readonly now: () => number
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  private timer: unknown = undefined
  private rendering = false
  private dirty = false
  private immediate = false
  private disposed = false
  private lastRenderEnd = Number.NEGATIVE_INFINITY
  private lastRenderDuration = 0

  constructor(private readonly options: RenderSchedulerOptions) {
    this.factor = options.factor ?? 2
    this.maxDelay = options.maxDelay ?? 5000
    this.now = options.now ?? (() => Date.now())
    this.setTimer =
      options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  // Whether a render is running or waiting to run.
  public get pending(): boolean {
    return this.rendering || this.timer !== undefined
  }

  // An edit: render soon, at the pace described above.
  public schedule(): void {
    if (this.disposed) {
      return
    }
    this.dirty = true
    if (this.rendering || this.timer !== undefined) {
      // The pending or running render (or the one following it) will pick up
      // the latest version of the document.
      return
    }
    this.startTimer()
  }

  // An explicit request (refresh command, document switch, settings change):
  // render as soon as possible, right after the running render if any.
  public renderNow(): void {
    if (this.disposed) {
      return
    }
    this.dirty = true
    this.cancelTimer()
    if (this.rendering) {
      this.immediate = true
      return
    }
    this.run()
  }

  // Drop the render waiting to run, if any. A running render is not affected.
  public cancel(): void {
    this.dirty = false
    this.immediate = false
    this.cancelTimer()
  }

  public dispose(): void {
    this.disposed = true
    this.cancel()
  }

  // Time to wait before the next render, measured from the end of the last one.
  private get gap(): number {
    const minDelay = Math.max(0, this.options.minDelay())
    const adaptive = Math.min(
      this.factor * this.lastRenderDuration,
      this.maxDelay,
    )
    return Math.max(minDelay, adaptive)
  }

  private startTimer(): void {
    const wait = Math.max(0, this.lastRenderEnd + this.gap - this.now())
    this.timer = this.setTimer(() => {
      this.timer = undefined
      this.run()
    }, wait)
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer)
      this.timer = undefined
    }
  }

  private async run(): Promise<void> {
    if (this.disposed || !this.dirty) {
      return
    }
    this.rendering = true
    this.dirty = false
    this.immediate = false
    const start = this.now()
    try {
      await this.options.render()
    } catch (error) {
      this.options.onError?.(error)
    } finally {
      this.rendering = false
      this.lastRenderEnd = this.now()
      this.lastRenderDuration = this.lastRenderEnd - start
    }
    if (this.disposed || !this.dirty) {
      return
    }
    if (this.immediate) {
      this.run()
    } else {
      this.startTimer()
    }
  }
}
