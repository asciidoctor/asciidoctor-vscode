import * as vscode from 'vscode'
import { disposeAll } from '../../core/dispose.js'
import { asciidocDocumentSelector } from '../../core/document.js'
import { AsciidocLoader } from '../asciidoctor/asciidocLoader.js'
import { AttributeReferenceProvider } from './attributeReferenceProvider.js'
import { BibtexProvider } from './bibtexCompletionProvider.js'
import { BuiltinDocumentAttributeProvider } from './builtinDocumentAttributeProvider.js'
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
      vscode.languages.registerCompletionItemProvider(
        asciidocDocumentSelector,
        new AttributeReferenceProvider(asciidocLoader),
        '{',
      ),
      vscode.languages.registerCompletionItemProvider(
        asciidocDocumentSelector,
        new BuiltinDocumentAttributeProvider(),
        ':',
      ),
    )
  }

  dispose() {
    disposeAll(this.disposables)
  }
}
