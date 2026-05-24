import * as vscode from 'vscode'
import { AsciidocLoader } from '../asciidocLoader.js'
import { TargetPathCompletionProvider } from '../providers/asciidoc.provider.js'
import { BibtexProvider } from '../providers/bibtex.provider.js'
import { xrefProvider } from '../providers/xref.provider.js'
import { disposeAll } from './dispose.js'
import { asciidocDocumentSelector } from './document.js'

export class AsciidocTargetPathAutoCompletionMonitor {
  private readonly disposables: vscode.Disposable[] = []
  constructor(asciidocLoader: AsciidocLoader) {
    const disposable = vscode.languages.registerCompletionItemProvider(
      asciidocDocumentSelector,
      new TargetPathCompletionProvider(asciidocLoader),
      ...[':', '/'],
    )

    const bibtexDisposable = vscode.languages.registerCompletionItemProvider(
      asciidocDocumentSelector,
      BibtexProvider,
      ...[':', '/'],
    )

    const xrefDisposable = vscode.languages.registerCompletionItemProvider(
      asciidocDocumentSelector,
      xrefProvider,
      ...[':', '/'],
    )

    this.disposables.push(disposable)
    this.disposables.push(bibtexDisposable)
    this.disposables.push(xrefDisposable)
  }

  dispose() {
    disposeAll(this.disposables)
  }

  private readonly _onDidIncludeAutoCompletionEmitter =
    new vscode.EventEmitter<{
      resource: vscode.Uri
      line: number
    }>()

  public readonly onDidIncludeAutoCompletionEmitter =
    this._onDidIncludeAutoCompletionEmitter.event
}
