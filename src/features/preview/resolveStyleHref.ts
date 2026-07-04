// Pure (vscode-free) resolution of a custom stylesheet path/URL into the URI the
// preview should load, *before* it is handed to `asWebviewUri`. Kept free of any
// `vscode` import (uses only `vscode-uri`) so it can be unit-tested under
// `node --test`, including the VS Code Web scenario where the workspace lives on
// a `vscode-vfs://` filesystem rather than on disk. See `AsciidoctorWebView
// Converter.fixHref`, which is now a thin adapter over this.

import { URI, Utils } from 'vscode-uri'

export type ResolvedStyle =
  | { kind: 'url'; href: string }
  | { kind: 'uri'; uri: URI }

/**
 * Resolve a configured stylesheet reference (from `asciidoc.preview.style`, the
 * `stylesheet` document attribute, or `asciidoc.preview.additionalStyles`) to
 * either a passthrough URL or a URI to be turned into a webview URI.
 *
 * - A `http:`/`https:`/`file:` reference is used verbatim (the preview CSP
 *   allows `https:`), so a remote stylesheet is *not* mistaken for a file and
 *   resolved against the project path (the original cause of #651).
 * - An absolute local path becomes a `file://` URI. NOTE: this has no counterpart
 *   in the VS Code Web editor (whose files live on `vscode-vfs://`), so an
 *   absolute path is a known limitation there.
 * - A relative path resolves against the workspace folder when there is one, else
 *   against the document's own directory — mirroring Asciidoctor's lookup and
 *   working on any filesystem scheme (including `vscode-vfs://`).
 */
export function resolveStyleUri(
  href: string,
  workspaceFolder: URI | undefined,
  documentUri: URI,
): ResolvedStyle {
  if (/^(https?|file):/i.test(href)) {
    return { kind: 'url', href }
  }
  if (href.startsWith('/') || /^[a-z]:\\/i.test(href)) {
    return { kind: 'uri', uri: URI.file(href) }
  }
  const base = workspaceFolder ?? Utils.dirname(documentUri)
  return { kind: 'uri', uri: Utils.joinPath(base, href) }
}
