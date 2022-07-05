/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path'
import * as vscode from 'vscode'
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink'
import { getUriForLinkWithKnownExternalScheme } from '../util/links'
import { similarArrayMatch } from '../similarArrayMatch'
import { isSchemeBlacklisted } from '../linkSanitizer'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export interface AsciidoctorLinkRegexes {
  [key: string]: RegExp
}

function normalizeLink (
  document: vscode.TextDocument,
  link: string,
  base: string
): vscode.Uri {
  const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link)
  if (externalSchemeUri) {
    return externalSchemeUri
  }

  // Assume it must be an relative or absolute file path
  // Use a fake scheme to avoid parse warnings
  const tempUri = vscode.Uri.parse(`vscode-resource:${link}`)

  let resourcePath
  if (!tempUri.path) {
    resourcePath = document.uri.path
  } else if (link[0] === '/') {
    resourcePath = tempUri.path
  } else {
    resourcePath = path.join(base, tempUri.path)
  }
  const sanitizedResourcePath = isSchemeBlacklisted(link) ? '#' : resourcePath
  return OpenDocumentLinkCommand.createCommandUri(sanitizedResourcePath, tempUri.fragment)
}

export default class LinkProvider implements vscode.DocumentLinkProvider {
  private engine: any

  constructor (engine) {
    this.engine = engine
  }

  public provideDocumentLinks (textDocument: vscode.TextDocument, _token: vscode.CancellationToken): vscode.DocumentLink[] {
    const asciidocParser = this.engine.getEngine()
    const { document, baseDocumentIncludeItems } = asciidocParser.load(textDocument)

    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentProcessorIncludes = baseDocumentIncludeItems
    const includeDirective = /^(\\)?include::([^[][^[]*)\[([^\n]+)?\]$/
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    const baseDocumentRegexIncludes = new Map()
    document.getSourceLines().forEach((line, index) => {
      const match = includeDirective.exec(line)
      if (match) {
        // match[2] is the include reference
        baseDocumentRegexIncludes.set(index, match[2].length)
      }
    })

    // find a corrected mapping for line numbers
    const betterIncludeMatching = similarArrayMatch(
      Array.from(baseDocumentRegexIncludes.keys()),
      baseDocumentProcessorIncludes.map((entry) => { return entry.position })
    )

    // update line items in reader results
    baseDocumentProcessorIncludes = baseDocumentProcessorIncludes.map((entry) => {
      return { ...entry, index: betterIncludeMatching[entry.index] }
    })

    // create include links
    const results: vscode.DocumentLink[] = []
    if (baseDocumentProcessorIncludes) {
      const base = path.dirname(textDocument.uri.fsPath)
      baseDocumentProcessorIncludes.forEach((entry) => {
        const lineNo = entry.position - 1
        const documentLink = new vscode.DocumentLink(
          new vscode.Range(
            // don't link to the include:: part or the square bracket contents
            new vscode.Position(lineNo, 9),
            new vscode.Position(lineNo, entry.length + 9)),
          normalizeLink(document, entry.name, base))
        documentLink.tooltip = localize('documentLink.openFile.tooltip', 'Open file {0}', entry.name)
        results.push(documentLink)
      })
    }
    return results
  }
}
