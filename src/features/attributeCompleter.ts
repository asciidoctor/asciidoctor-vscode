import * as vscode from 'vscode';

import { AsciidocParser } from '../asciidocParser'

export class AttributeCompleter {

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {

    const adoc = new AsciidocParser(document.uri.fsPath)
    adoc.parseText(document.getText(), document)
    const attributes = adoc.document.getAttributes()
    let attribs = []
        
    for (const key in attributes) {
      let attrib = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable)
      attrib.detail = attributes[key].toString()
      attribs.push(attrib)
    }

    return attribs

  }
}
