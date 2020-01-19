import * as vscode from 'vscode';

import { AsciidocParser } from '../text-parser';

export class AttributeCompleter {

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {

        const adoc = new AsciidocParser(document.uri.fsPath)
        adoc.parseText(document.getText())

        let attribs = []
        for (const [key, value] of Object.entries(adoc.document.getAttributes()))
        {
            let attrib = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable)
            attrib.detail = value.toString()
            attribs.push(attrib)
        }

        return attribs

    }
}
