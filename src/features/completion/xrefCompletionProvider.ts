import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { getAntoraDocumentContext } from '../antora/antoraDocument.js'
import { AsciidocLoader } from '../asciidoctor/asciidocLoader.js'
import { Context, createContext } from './createContext.js'
import {
  CrossReference,
  getReferencesFromContent,
  getReferencesFromDocument,
} from './crossReferences.js'
import {
  buildCrossRefLabel,
  matchesCrossRefQuery,
  parseCrossRefQuery,
  parseInternalRefQuery,
  shouldProvideCompletion,
} from './xrefCompletion.js'

/**
 * Completes `xref:` cross references (to files and their anchors) and `<<`
 * internal references. Candidates come from Asciidoctor's reference catalog (see
 * `crossReferences`), so sections — including their auto-generated ids — block
 * anchors and bibliography entries are all offered, not just explicit anchors.
 *
 * On Antora pages, cross references use resource ids resolved against the content
 * catalog, so the workspace-wide file-path suggestions produced here are noise;
 * the `AntoraResourceCompletionProvider` takes over the `xref:` macro instead.
 */
export class XrefCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const context = createContext(document, position)
    if (
      shouldProvideCompletion(context.textFullLine, position.character, 'xref:')
    ) {
      const antoraDocumentContext = await getAntoraDocumentContext(
        document.uri,
        this.asciidocLoader.context.workspaceState,
      )
      if (antoraDocumentContext !== undefined) {
        return []
      }
      return provideCrossRef(context, this.asciidocLoader)
    } else if (
      shouldProvideCompletion(context.textFullLine, position.character, '<<')
    ) {
      return provideInternalRef(context, this.asciidocLoader)
    } else {
      return []
    }
  }
}

async function getReferencesFromFile(
  file: vscode.Uri,
): Promise<CrossReference[]> {
  const data = await vscode.workspace.fs.readFile(file)
  // `TextDecoder` works in both the Node desktop extension host and the browser
  // extension host, unlike `Buffer` which is undefined in the web worker (it
  // threw `ReferenceError: Buffer is not defined` on cross-reference
  // completion in VS Code for the Web).
  return getReferencesFromContent(new TextDecoder('utf-8').decode(data))
}

/**
 * Provide Completion Items
 */
async function provideCrossRef(
  context: Context,
  asciidocLoader: AsciidocLoader,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const { search, hasBracket } = parseCrossRefQuery(
    textFullLine,
    position.character,
  )

  const completionItems: vscode.CompletionItem[] = []
  const currentFilePath = document.uri.fsPath
  const workspacesAdocFiles = await findFiles('**/*.adoc')
  for (const adocFile of workspacesAdocFiles) {
    // The active document is parsed through the loader so that unsaved edits,
    // configured attributes and includes are taken into account; other files are
    // parsed standalone from disk to keep completion responsive.
    const references =
      adocFile.fsPath === currentFilePath
        ? getReferencesFromDocument(await asciidocLoader.load(document))
        : await getReferencesFromFile(adocFile)
    for (const reference of references) {
      if (matchesCrossRefQuery(reference.id, search)) {
        const labelText = buildCrossRefLabel(reference.id, hasBracket, {
          currentFilePath,
          targetFilePath: adocFile.fsPath,
        })
        completionItems.push(buildCrossRefItem(labelText, reference))
      }
    }
  }

  return completionItems
}

function buildCrossRefItem(
  labelText: string,
  reference: CrossReference,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    labelText,
    vscode.CompletionItemKind.Reference,
  )
  if (reference.reftext) {
    item.detail = reference.reftext
  }
  return item
}

async function provideInternalRef(
  context: Context,
  asciidocLoader: AsciidocLoader,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const search = parseInternalRefQuery(textFullLine, position.character)

  const references = getReferencesFromDocument(
    await asciidocLoader.load(document),
  )

  return references
    .filter((reference) => reference.id.match(search))
    .map((reference) => {
      const item: vscode.CompletionItem = {
        label: reference.id,
        kind: vscode.CompletionItemKind.Reference,
        insertText: `${reference.id}>>`,
      }
      if (reference.reftext) {
        item.detail = reference.reftext
      }
      return item
    })
}
