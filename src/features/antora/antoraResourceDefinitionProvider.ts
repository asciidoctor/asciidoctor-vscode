import * as vscode from 'vscode'
import { getAntoraDocumentContext } from './antoraDocument.js'
import { matchAntoraResourceMacroAt } from './antoraResourceMacro.js'

export interface AntoraResourceMacro {
  /** The resource id to resolve, without any `#fragment`. */
  id: string
  /** The default Antora family to assume when the id does not specify one. */
  family: string
  /** The range of the resource id within the line. */
  range: vscode.Range
}

/**
 * Find the Antora resource macro whose target is located under `character` on
 * the given line, if any.
 */
export function findAntoraResourceMacroAt(
  lineText: string,
  lineNumber: number,
  character: number,
): AntoraResourceMacro | undefined {
  const match = matchAntoraResourceMacroAt(lineText, character)
  if (match === undefined) {
    return undefined
  }
  return {
    id: match.id,
    family: match.family,
    range: new vscode.Range(
      new vscode.Position(lineNumber, match.idStart),
      new vscode.Position(lineNumber, match.idEnd),
    ),
  }
}

function abspathToUri(abspath: string): vscode.Uri {
  // The content catalog stores the URI path (`/Users/...` on POSIX, `/c:/...`
  // on Windows). `Uri.file` expects a file system path, so strip the leading
  // slash on Windows drive-letter paths.
  const fsPath = abspath.replace(/^\/([a-zA-Z]:)/, '$1')
  return vscode.Uri.file(fsPath)
}

/**
 * Resolve Antora resource ids (`image:`, `xref:`, `include::`) to the file they
 * point at, so users can jump to the definition or Ctrl+click the resource id.
 */
export class AntoraResourceDefinitionProvider
  implements vscode.DefinitionProvider
{
  constructor(private readonly workspaceState: vscode.Memento) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | undefined> {
    const lineText = document.lineAt(position.line).text
    const macro = findAntoraResourceMacroAt(
      lineText,
      position.line,
      position.character,
    )
    if (macro === undefined) {
      return undefined
    }
    const antoraDocumentContext = await getAntoraDocumentContext(
      document.uri,
      this.workspaceState,
    )
    if (antoraDocumentContext === undefined) {
      return undefined
    }
    const abspath = antoraDocumentContext.resolveAntoraResourceIds(
      macro.id,
      macro.family,
    )
    if (abspath === undefined) {
      return undefined
    }
    return new vscode.Location(abspathToUri(abspath), new vscode.Position(0, 0))
  }
}
