// The entry point of the worker thread that converts the documents for the
// preview, off the extension host thread (#1245). See `previewWorkerClient.ts`.
//
// This module, and every module it imports, MUST NOT import `vscode`, which is
// not available in a worker thread.
import { parentPort } from 'node:worker_threads'
import {
  convertForPreview,
  type PreviewHost,
  type UriComponents,
} from './previewConversion.js'
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from './previewWorkerProtocol.js'

const port = parentPort
if (port === null) {
  throw new Error('The preview worker must run in a worker thread')
}

function post(message: FromWorkerMessage): void {
  port!.postMessage(message)
}

let nextCallId = 0
const calls = new Map<
  number,
  { resolve: (value: Uint8Array) => void; reject: (error: Error) => void }
>()

function readFile(id: number, uri: UriComponents): Promise<Uint8Array> {
  const callId = nextCallId++
  return new Promise((resolve, reject) => {
    calls.set(callId, { resolve, reject })
    post({ type: 'readFile', id, callId, uri })
  })
}

async function handleConvert(
  message: Extract<ToWorkerMessage, { type: 'convert' }>,
): Promise<void> {
  const { id, request } = message
  const host: PreviewHost = {
    readFile: (uri) => readFile(id, uri),
    warn: (text) => post({ type: 'warn', id, message: text }),
  }
  try {
    // The document cannot cross the thread boundary.
    const { document: _document, ...result } = await convertForPreview(
      request,
      host,
    )
    post({ type: 'result', id, result })
  } catch (e) {
    post({
      type: 'error',
      id,
      message: e instanceof Error ? e.message : String(e),
    })
  }
}

// One conversion at a time: the converter and the syntax highlighter of the
// preview are registered globally, so two conversions that interleave at I/O
// points would use each other's.
let queue: Promise<void> = Promise.resolve()

port.on('message', (message: ToWorkerMessage) => {
  switch (message.type) {
    case 'convert':
      queue = queue.then(() => handleConvert(message))
      break
    case 'reply': {
      const call = calls.get(message.callId)
      calls.delete(message.callId)
      if (message.error !== undefined) {
        call?.reject(new Error(message.error))
      } else {
        call?.resolve(message.value!)
      }
      break
    }
  }
})
