import * as vscode from 'vscode'
import builtinAttributes from './builtinDocumentAttribute.json' with {
  type: 'json',
}

export class BuiltinDocumentAttributeProvider {
  private readonly completionItems = Object.keys(builtinAttributes).map(
    (key) => {
      const value = builtinAttributes[key as keyof typeof builtinAttributes]
      const completionItem = new vscode.CompletionItem(
        { label: value.label, description: value.description },
        vscode.CompletionItemKind.Text,
      )
      completionItem.insertText = new vscode.SnippetString(value.insertText)
      // Filter against the bare attribute name so that an explicit completion
      // request on a partially typed declaration (e.g. ":sect") matches.
      completionItem.filterText = key
      return completionItem
    },
  )

  async provideCompletionItems(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const linePrefix = textDocument
      .lineAt(position)
      .text.substr(0, position.character)
    // An attribute entry starts at the beginning of the line with a colon,
    // optionally followed by the (partial) attribute name being typed.
    const match = linePrefix.match(/^:([\w-]*)$/)
    if (match === null) {
      return undefined
    }
    // Replace the partially typed name so the inserted snippet does not get
    // appended to it (e.g. ":sect" + "sectids:" => ":sectids:").
    const typedName = match[1]
    const range = new vscode.Range(
      position.line,
      position.character - typedName.length,
      position.line,
      position.character,
    )
    return this.completionItems.map((completionItem) => {
      completionItem.range = range
      return completionItem
    })
  }
}
