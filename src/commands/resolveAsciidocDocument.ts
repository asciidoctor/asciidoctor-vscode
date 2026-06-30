import * as vscode from 'vscode'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'

/**
 * Identifies the preview `<body>` in the `data-vscode-context` attribute set by
 * the {@link AsciidoctorWebViewConverter}. Commands invoked from the preview's
 * `webview/context` menu receive this value, which lets them target the
 * previewed document rather than the active editor.
 */
export const ASCIIDOC_PREVIEW_WEBVIEW_SECTION = 'asciidoc-preview'

/**
 * Shape of the object VS Code passes to a command invoked from a
 * `webview/context` menu. It mirrors the JSON stored in the `data-vscode-context`
 * attribute of the clicked element (or its closest ancestor that defines one).
 */
export interface WebviewContext {
  readonly webviewSection?: string
}

/**
 * Resolve the AsciiDoc document a command should operate on.
 *
 * When a command is triggered from the preview context menu, the active text
 * editor is unreliable: a focused webview is not an active editor, so
 * `vscode.window.activeTextEditor` points at whatever text editor was focused
 * last (possibly an unrelated file, possibly nothing). In that case we resolve
 * the document backing the focused preview instead. Otherwise we fall back to
 * the active editor, preserving the behaviour when the command is run from the
 * editor title, the editor itself, or the command palette.
 */
export async function resolveAsciidocDocument(
  previewManager: AsciidocPreviewManager,
  context?: WebviewContext,
): Promise<vscode.TextDocument | undefined> {
  if (
    context?.webviewSection === ASCIIDOC_PREVIEW_WEBVIEW_SECTION &&
    previewManager.activePreviewResource
  ) {
    return vscode.workspace.openTextDocument(
      previewManager.activePreviewResource,
    )
  }
  return vscode.window.activeTextEditor?.document
}
