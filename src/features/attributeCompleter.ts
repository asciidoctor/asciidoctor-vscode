import * as vscode from 'vscode'

import { AsciidocParser } from '../asciidocParser'

export class AttributeCompleter {

  constructor(private readonly extensionUri: vscode.Uri) {
  }

  async provideCompletionItems (textDocument: vscode.TextDocument, _position: vscode.Position) {
    const { html, document } = await new AsciidocParser(this.extensionUri).parseText(textDocument.getText(), textDocument)
    if (document) {
      const attributes = document.getAttributes()
      const attribs = []

      for (const key in attributes) {
        const attrib = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable)
        attrib.detail = attributes[key].toString()
        attribs.push(attrib)
      }

      return attribs
    }
  }
}
