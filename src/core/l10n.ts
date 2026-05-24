import * as vscode from 'vscode'

// Injected at build time by esbuild for the browser bundle (see build-browser.mjs).
// Undefined in the Node.js build — vscode.l10n handles bundle loading there.
declare const __L10N_BUNDLE__: Record<string, string> | undefined

const fallbackBundle: Record<string, string> =
  typeof __L10N_BUNDLE__ !== 'undefined' ? (__L10N_BUNDLE__ as any) : {}

export function t(key: string, ...args: (string | number | boolean)[]): string {
  const result = vscode.l10n.t(key, ...args)
  // vscode.l10n.t returns the key itself when no bundle is loaded (e.g. English locale
  // in the web extension host). Fall back to the embedded bundle in that case.
  if (result === key && fallbackBundle[key]) {
    let str = fallbackBundle[key]
    args.forEach((arg, i) => {
      str = str.replace(new RegExp(`\\{${i}\\}`, 'g'), String(arg))
    })
    return str
  }
  return result
}
