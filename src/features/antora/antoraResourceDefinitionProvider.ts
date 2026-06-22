import * as vscode from 'vscode'
import { getAntoraDocumentContext } from './antoraDocument.js'

// Matches the `image:`/`image::`, `xref:` and `include::` macros and captures
// their target, e.g. `image::2.0@cli:commands:output.png[]`.
const MACRO_RX = /(image|xref|include)(::?)([^\s[\]]+)\[/g

// An Antora resource id always carries a family/component/module/version marker.
const RESOURCE_ID_DETECTOR_RX = /[$:@]/

const DEFAULT_FAMILY_BY_MACRO: { [macro: string]: string } = {
  image: 'image',
  xref: 'page',
  include: 'page',
}

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
  for (const match of lineText.matchAll(MACRO_RX)) {
    const macro = match[1]
    const target = match[3]
    const targetStart = match.index + match[1].length + match[2].length
    const targetEnd = targetStart + target.length
    if (character < targetStart || character > targetEnd) {
      continue
    }
    // Drop the fragment (e.g. `xref:page.adoc#anchor[]`) before resolution.
    const fragmentIndex = target.indexOf('#')
    const id = fragmentIndex === -1 ? target : target.slice(0, fragmentIndex)
    if (id.length === 0) {
      continue
    }
    // For includes, only resource ids go through the content catalog; plain
    // relative paths are resolved by the include processor at render time.
    if (macro === 'include' && !RESOURCE_ID_DETECTOR_RX.test(id)) {
      continue
    }
    const idEnd = fragmentIndex === -1 ? targetEnd : targetStart + fragmentIndex
    return {
      id,
      family: DEFAULT_FAMILY_BY_MACRO[macro],
      range: new vscode.Range(
        new vscode.Position(lineNumber, targetStart),
        new vscode.Position(lineNumber, idEnd),
      ),
    }
  }
  return undefined
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
