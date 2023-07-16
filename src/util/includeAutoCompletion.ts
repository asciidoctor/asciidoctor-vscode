import * as vscode from 'vscode'
import { TargetPathCompletionProvider } from '../providers/asciidoc.provider'
import { BibtexProvider } from '../providers/bibtex.provider'
import { xrefProvider } from '../providers/xref.provider'
import { disposeAll } from './dispose'
import { AsciidocLoader } from '../asciidocLoader'

export class AsciidocTargetPathAutoCompletionMonitor {
  private readonly disposables: vscode.Disposable[] = []
  constructor (asciidocLoader: AsciidocLoader) {
    const disposable = vscode.languages.registerCompletionItemProvider(
      {
        language: 'asciidoc',
        scheme: 'file',
      },
      new TargetPathCompletionProvider(asciidocLoader),
      ...[':', '/']
    )

    const bibtexDisposable = vscode.languages.registerCompletionItemProvider(
      {
        language: 'asciidoc',
        scheme: 'file',
      },
      BibtexProvider,
      ...[':', '/']
    )

    const xrefDisposable = vscode.languages.registerCompletionItemProvider(
      {
        language: 'asciidoc',
        scheme: 'file',
      },
      xrefProvider,
      ...[':', '/']
    )

    this.disposables.push(disposable)
    this.disposables.push(bibtexDisposable)
    this.disposables.push(xrefDisposable)
  }

  dispose () {
    disposeAll(this.disposables)
  }

  private readonly _onDidIncludeAutoCompletionEmitter = new vscode.EventEmitter<{
    resource: vscode.Uri;
    line: number;
  }>()

  public readonly onDidIncludeAutoCompletionEmitter = this
    ._onDidIncludeAutoCompletionEmitter.event
}
