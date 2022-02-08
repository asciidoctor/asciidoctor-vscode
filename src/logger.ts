/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { lazy } from './util/lazy'

enum TraceType {
  Off,
  Verbose
}

namespace Trace {
  export function fromString (value: string): TraceType {
    value = value.toLowerCase()
    switch (value) {
      case 'off':
        return TraceType.Off
      case 'verbose':
        return TraceType.Verbose
      default:
        return TraceType.Off
    }
  }
}

function isString (value: any): value is string {
  return Object.prototype.toString.call(value) === '[object String]'
}

export class Logger {
  private trace?: TraceType

  private readonly outputChannel = lazy(() =>
    vscode.window.createOutputChannel('Asciidoc')
  )

  constructor () {
    this.updateConfiguration()
  }

  public log (message: string, data?: any): void {
    if (this.trace === TraceType.Verbose) {
      this.appendLine(`[Log - ${new Date().toLocaleTimeString()}] ${message}`)
      if (data) {
        this.appendLine(Logger.data2String(data))
      }
    }
  }

  public updateConfiguration () {
    this.trace = this.readTrace()
  }

  private appendLine (value: string) {
    return this.outputChannel.value.appendLine(value)
  }

  private readTrace (): TraceType {
    return Trace.fromString(
      vscode.workspace
        .getConfiguration(null, null)
        .get<string>('asciidoc.trace', 'off')
    )
  }

  private static data2String (data: any): string {
    if (data instanceof Error) {
      if (isString(data.stack)) {
        return data.stack
      }
      return (data as Error).message
    }
    if (isString(data)) {
      return data
    }
    return JSON.stringify(data, undefined, 2)
  }
}
