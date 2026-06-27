import * as vscode from 'vscode'
import { lazy } from '../lib/lazy.js'

// A single VS Code log output channel shared by every Logger instance (the
// extension wires one up through dependency injection, while modules without
// access to it import the `logger` singleton below). Creating the channel more
// than once would surface duplicate "Asciidoctor" entries in the Output panel,
// so it is created lazily, once.
//
// A LogOutputChannel — rather than `console.*` or a plain output channel —
// gives us native log levels with timestamps, filtering through the standard
// "Developer: Set Log Level…" command, and visibility via "Developer: Show
// Logs…" without the developer tools being open. `trace` and `debug` messages
// are hidden unless the user raises the log level, so verbose diagnostics can
// live in the code without spamming everyone.
const sharedOutputChannel = lazy<vscode.LogOutputChannel>(() =>
  vscode.window.createOutputChannel('Asciidoctor', { log: true }),
)

export class Logger {
  /**
   * The current verbosity of the shared *Asciidoctor* output channel, driven by
   * the standard "Developer: Set Log Level…" command. Callers that gate verbose
   * diagnostics elsewhere (e.g. the preview webview console) can read this to
   * stay in sync with the channel instead of relying on a dedicated setting.
   */
  public get logLevel(): vscode.LogLevel {
    return sharedOutputChannel.value.logLevel
  }

  /**
   * Fires when the user changes the log level of the *Asciidoctor* channel.
   */
  public get onDidChangeLogLevel(): vscode.Event<vscode.LogLevel> {
    return sharedOutputChannel.value.onDidChangeLogLevel
  }

  public trace(message: string, ...args: unknown[]): void {
    sharedOutputChannel.value.trace(message, ...args)
  }

  public debug(message: string, ...args: unknown[]): void {
    sharedOutputChannel.value.debug(message, ...args)
  }

  public info(message: string, ...args: unknown[]): void {
    sharedOutputChannel.value.info(message, ...args)
  }

  public warn(message: string, ...args: unknown[]): void {
    sharedOutputChannel.value.warn(message, ...args)
  }

  public error(message: string | Error, ...args: unknown[]): void {
    sharedOutputChannel.value.error(message, ...args)
  }
}

/**
 * Shared logger for modules that are not wired through dependency injection.
 */
export const logger = new Logger()
