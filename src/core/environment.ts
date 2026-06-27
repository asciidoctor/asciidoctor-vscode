/**
 * Whether the extension runs in the browser (VS Code for the Web) extension
 * host, where Node's `fs` is unavailable. The browser build injects a `process`
 * shim that sets `process.browser`, so this is how we branch on the host.
 */
export function isBrowserEnvironment(): boolean {
  return 'browser' in process && (process as any).browser === true
}
