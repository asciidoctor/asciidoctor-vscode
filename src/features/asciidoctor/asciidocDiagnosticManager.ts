import * as vscode from 'vscode'
import { AsciidocLoader } from './asciidocLoader.js'
import { AsciidoctorDiagnosticProvider } from './asciidoctorDiagnostic.js'

const ASCIIDOC_LANGUAGE_ID = 'asciidoc'

/**
 * Owns the lifecycle of AsciiDoc diagnostics.
 *
 * Diagnostics are computed from a single, fully-resolved parse and refreshed
 * only when a document is opened or its text changes (debounced). They are
 * cleared when the document is closed. Crucially, they are decoupled from the
 * preview and from language-feature providers: opening or closing the preview,
 * switching the active editor, or invoking a completion/symbol/link provider no
 * longer recomputes or clears them.
 */
export class AsciidocDiagnosticManager {
  private readonly pendingByUri = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()

  constructor(
    private readonly loader: AsciidocLoader,
    private readonly diagnostic: AsciidoctorDiagnosticProvider,
    private readonly debounceMs = 500,
  ) {}

  public register(): vscode.Disposable {
    const subscriptions: vscode.Disposable[] = [
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.schedule(document, 0),
      ),
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.schedule(event.document, this.debounceMs),
      ),
      vscode.workspace.onDidCloseTextDocument((document) =>
        this.clear(document),
      ),
    ]
    // Diagnose documents that are already open when the extension activates.
    for (const document of vscode.workspace.textDocuments) {
      this.schedule(document, 0)
    }
    return vscode.Disposable.from(...subscriptions, {
      dispose: () => this.cancelAll(),
    })
  }

  private schedule(document: vscode.TextDocument, delay: number) {
    if (document.languageId !== ASCIIDOC_LANGUAGE_ID) {
      return
    }
    const key = document.uri.toString()
    this.cancel(key)
    this.pendingByUri.set(
      key,
      setTimeout(() => {
        this.pendingByUri.delete(key)
        // The loader publishes diagnostics into the shared collection; swallow
        // errors so a transient parse failure never breaks the listener.
        this.loader.reportDiagnostics(document).catch(() => {
          /* ignore */
        })
      }, delay),
    )
  }

  private clear(document: vscode.TextDocument) {
    if (document.languageId !== ASCIIDOC_LANGUAGE_ID) {
      return
    }
    this.cancel(document.uri.toString())
    this.diagnostic.delete(document.uri)
  }

  private cancel(key: string) {
    const pending = this.pendingByUri.get(key)
    if (pending !== undefined) {
      clearTimeout(pending)
      this.pendingByUri.delete(key)
    }
  }

  private cancelAll() {
    for (const pending of this.pendingByUri.values()) {
      clearTimeout(pending)
    }
    this.pendingByUri.clear()
  }
}
