// The messages exchanged between the extension host and the preview's worker
// thread (see `previewWorker.ts` and `previewWorkerClient.ts`).
import type {
  PreviewRequest,
  PreviewResult,
  UriComponents,
} from './previewConversion.js'

/** The result of a conversion, without the document, that cannot be sent. */
export type WorkerPreviewResult = Omit<PreviewResult, 'document'>

/** From the extension host to the worker thread. */
export type ToWorkerMessage =
  | { type: 'convert'; id: number; request: PreviewRequest }
  | {
      type: 'reply'
      callId: number
      value?: Uint8Array
      error?: string
    }

/** From the worker thread to the extension host. */
export type FromWorkerMessage =
  | { type: 'result'; id: number; result: WorkerPreviewResult }
  | { type: 'error'; id: number; message: string }
  | { type: 'readFile'; id: number; callId: number; uri: UriComponents }
  | { type: 'warn'; id: number; message: string }
