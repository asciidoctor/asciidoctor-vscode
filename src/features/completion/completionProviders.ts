import * as vscode from 'vscode'
import { AsciidocLoader } from '../../asciidocLoader.js'
import { disposeAll } from '../../util/dispose.js'
import { asciidocDocumentSelector } from '../../util/document.js'
import { BibtexProvider } from './bibtexCompletionProvider.js'
import { TargetPathCompletionProvider } from './targetPathCompletionProvider.js'
import { xrefProvider } from './xrefCompletionProvider.js'

export class AsciidocCompletionProviders {
  private readonly disposables: vscode.Disposable[] = []

  constructor(asciidocLoader: AsciidocLoader) {
    this.disposables.push(
      vscode.languages.registerCompletionItemProvider(
        asciidocDocumentSelector,
        new TargetPathCompletionProvider(asciidocLoader),
        ...[':', '/'],
      ),
      vscode.languages.registerCompletionItemProvider(
        asciidocDocumentSelector,
        BibtexProvider,
        ...[':', '/'],
      ),
      vscode.languages.registerCompletionItemProvider(
        asciidocDocumentSelector,
        xrefProvider,
        ...[':', '/'],
      ),
    )
  }

  dispose() {
    disposeAll(this.disposables)
  }
}
