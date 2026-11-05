// Runs the preview conversion in a worker thread (desktop only), so that the
// conversion of a large document does not block the extension host, which is
// shared with the other extensions (#1245).
//
// The worker thread is started on the first conversion and kept for the next
// ones: starting it, and loading Asciidoctor.js in it, costs more than the
// conversion of a small document. It converts one document at a time; the
// preview already waits for a render to end before starting the next one.
//
// The worker thread cannot use the VS Code API: it reads files through the
// extension host (see `PreviewHost`).
//
// This module MUST NOT import `vscode`, so that it can be unit tested in plain
// Node.
import { Worker } from 'node:worker_threads'
import type {
  PreviewHost,
  PreviewRequest,
  PreviewResult,
} from './previewConversion.js'
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from './previewWorkerProtocol.js'

/**
 * The worker thread cannot convert the document, e.g. it failed to start or it
 * crashed: the caller should convert the document in the extension host.
 */
export class PreviewWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PreviewWorkerUnavailableError'
  }
}

export interface PreviewWorker {
  /**
   * Converts the document in the worker thread. Rejects with a
   * `PreviewWorkerUnavailableError` when the worker thread cannot convert it,
   * and with an `Error` when the conversion itself fails.
   */
  convert(request: PreviewRequest, host: PreviewHost): Promise<PreviewResult>

  dispose(): void
}

interface PendingConversion {
  resolve(result: PreviewResult): void
  reject(error: Error): void
  host: PreviewHost
}

export class PreviewWorkerClient implements PreviewWorker {
  private worker: Worker | undefined
  private nextId = 0
  private readonly pending = new Map<number, PendingConversion>()
  private failures = 0
  private disposed = false

  /**
   * @param workerUrl the URL of the bundled `previewWorker.ts`.
   * @param maxFailures the number of times the worker thread can fail before
   * it is no longer started, for the rest of the session.
   */
  constructor(
    private readonly workerUrl: URL,
    private readonly maxFailures = 3,
  ) {}

  convert(request: PreviewRequest, host: PreviewHost): Promise<PreviewResult> {
    if (this.disposed) {
      return Promise.reject(
        new PreviewWorkerUnavailableError('the worker thread was disposed'),
      )
    }
    if (this.failures >= this.maxFailures) {
      return Promise.reject(
        new PreviewWorkerUnavailableError(
          `the worker thread failed ${this.failures} times`,
        ),
      )
    }
    let worker: Worker
    try {
      worker = this.start()
    } catch (e) {
      this.failures++
      return Promise.reject(
        new PreviewWorkerUnavailableError(
          `unable to start the worker thread: ${e}`,
        ),
      )
    }
    const id = this.nextId++
    return new Promise<PreviewResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, host })
      try {
        this.post(worker, { type: 'convert', id, request })
      } catch (e) {
        // e.g. a `DataCloneError`, when a setting holds a value that cannot be
        // sent to the worker thread.
        this.pending.delete(id)
        reject(
          new PreviewWorkerUnavailableError(
            `unable to send the document to the worker thread: ${e}`,
          ),
        )
      }
    })
  }

  dispose(): void {
    this.disposed = true
    const worker = this.worker
    this.worker = undefined
    this.rejectAll(
      new PreviewWorkerUnavailableError('the worker thread was disposed'),
    )
    worker?.terminate().catch(() => {
      // already stopped
    })
  }

  private start(): Worker {
    if (this.worker !== undefined) {
      return this.worker
    }
    const worker = new Worker(this.workerUrl)
    // Do not keep the extension host process alive.
    worker.unref()
    worker.on('message', (message: FromWorkerMessage) =>
      this.onMessage(worker, message),
    )
    worker.on('error', (error) => this.onFailure(worker, String(error)))
    worker.on('exit', (code) =>
      this.onFailure(worker, `the worker thread exited with code ${code}`),
    )
    this.worker = worker
    return worker
  }

  private onMessage(worker: Worker, message: FromWorkerMessage): void {
    const conversion = this.pending.get(message.id)
    switch (message.type) {
      case 'result':
        this.pending.delete(message.id)
        conversion?.resolve(message.result)
        break
      case 'error':
        this.pending.delete(message.id)
        conversion?.reject(new Error(message.message))
        break
      case 'warn':
        conversion?.host.warn(message.message)
        break
      case 'readFile': {
        const { callId } = message
        const readFile =
          conversion?.host.readFile(message.uri) ??
          Promise.reject(new Error('the conversion is over'))
        readFile.then(
          (value) => this.post(worker, { type: 'reply', callId, value }),
          (error) =>
            this.post(worker, { type: 'reply', callId, error: String(error) }),
        )
        break
      }
    }
  }

  private onFailure(worker: Worker, reason: string): void {
    // A failed worker thread emits an `error`, then an `exit` event.
    if (this.worker !== worker) {
      return
    }
    this.worker = undefined
    this.failures++
    this.rejectAll(new PreviewWorkerUnavailableError(reason))
  }

  private rejectAll(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const conversion of pending) {
      conversion.reject(error)
    }
  }

  private post(worker: Worker, message: ToWorkerMessage): void {
    worker.postMessage(message)
  }
}
