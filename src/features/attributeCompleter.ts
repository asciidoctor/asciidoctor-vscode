import * as vscode from 'vscode'

import { AsciidocParser } from '../text-parser'

export class AttributeCompleter {
  provideCompletionItems (document: vscode.TextDocument, _position: vscode.Position) {
    const adoc = new AsciidocParser(document.uri.fsPath)
    adoc.parseText(document.getText(), document)
    const attributes = adoc.document.getAttributes()
    const attribs = []

    for (const key in attributes) {
      const attrib = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable)
      attrib.detail = attributes[key].toString()
      attribs.push(attrib)
    }

    return attribs
  }
}
