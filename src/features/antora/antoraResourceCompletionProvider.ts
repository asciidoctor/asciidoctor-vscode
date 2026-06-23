import * as vscode from 'vscode'
import { getAntoraDocumentContext } from './antoraDocument.js'
import {
  buildResourceIds,
  findAntoraResourceMacroPrefix,
} from './antoraResourceId.js'

// Re-exported so existing importers keep resolving these helpers from the
// provider; the implementation now lives in the vscode-free `antoraResourceId`
// module so it can be unit-tested without the extension host.
export { buildResourceIds, findAntoraResourceMacroPrefix }

const KIND_BY_FAMILY: { [family: string]: vscode.CompletionItemKind } = {
  image: vscode.CompletionItemKind.File,
  page: vscode.CompletionItemKind.Reference,
  partial: vscode.CompletionItemKind.Reference,
  example: vscode.CompletionItemKind.Reference,
}

/**
 * Suggest Antora resource ids (pages, images, partials, examples) inside
 * `image:`, `xref:` and `include::` macros, sourced from the content catalog.
 */
export class AntoraResourceCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(private readonly workspaceState: vscode.Memento) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const lineText = document.lineAt(position.line).text
    const lineTextBeforeCursor = lineText.slice(0, position.character)
    const macroContext = findAntoraResourceMacroPrefix(lineTextBeforeCursor)
    if (macroContext === undefined) {
      return []
    }
    const antoraDocumentContext = await getAntoraDocumentContext(
      document.uri,
      this.workspaceState,
    )
    if (antoraDocumentContext === undefined) {
      return []
    }
    const current = antoraDocumentContext.resourceContext
    const contentCatalog = antoraDocumentContext.getContentCatalog()
    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, macroContext.targetStart),
      position,
    )
    // Complete the macro with its `[]` unless it is already there, placing the
    // cursor between the brackets for the alt text / attributes.
    const hasClosingBracket = lineText.charAt(position.character) === '['
    const items: vscode.CompletionItem[] = []
    for (const family of macroContext.families) {
      const kind = KIND_BY_FAMILY[family] ?? vscode.CompletionItemKind.Reference
      for (const resource of contentCatalog.findBy({ family })) {
        const src = resource.src
        const ids = buildResourceIds(src, current, macroContext.defaultFamily)
        ids.forEach((id, index) => {
          const item = new vscode.CompletionItem(id, kind)
          item.detail =
            `${family} · ${src.component} ${src.version ?? ''}`.trim()
          item.range = replaceRange
          item.insertText = hasClosingBracket
            ? id
            : new vscode.SnippetString(`${id}[$0]`)
          // Keep the variants of a resource grouped and ordered from the
          // shortest (preferred) to the fully qualified form.
          item.sortText = `${family}_${src.relative}_${index}`
          items.push(item)
        })
      }
    }
    return items
  }
}
