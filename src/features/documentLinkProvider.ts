/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink'
import { getUriForLinkWithKnownExternalScheme } from '../util/links'
import { similarArrayMatch } from '../similarArrayMatch'
import { isSchemeBlacklisted } from '../linkSanitizer'

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

  public async provideDocumentLinks (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink[]> {
    const base = path.dirname(document.uri.fsPath)
    const text = document.getText()

    const adParser = await this.engine.getEngine(document.uri)
    adParser.convertUsingJavascript(text, document, false, 'html', true)

    const results: vscode.DocumentLink[] = []
    const lines = adParser.document.getSourceLines()

    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentProcessorIncludes = adParser.baseDocumentIncludeItems
    const includeDirective = /^(\\)?include::([^[][^[]*)\[([^\n]+)?\]$/
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    const baseDocumentRegexIncludes = new Map()
    lines.forEach((line, index) => {
      const match = includeDirective.exec(line)
      if (match) {
        // match[2] is the include reference
        baseDocumentRegexIncludes.set(index, match[2].length)
      }
    })

    // find a corrected mapping for line numbers
    const betterIncludeMatching = similarArrayMatch(
      Array.from(baseDocumentRegexIncludes.keys()),
      baseDocumentProcessorIncludes.map((elem) => {
        return elem[1]
      }))

    // update line items in reader results
    baseDocumentProcessorIncludes = baseDocumentProcessorIncludes.map((elem, index) => {
      elem[1] = betterIncludeMatching[index]
      return elem
    })

    // create include links
    if (baseDocumentProcessorIncludes) {
      baseDocumentProcessorIncludes.forEach((include) => {
        const lineNo = include[1]
        const documentLink = new vscode.DocumentLink(
          new vscode.Range(
            // don't link to the include:: part or the square bracket contents
            new vscode.Position(lineNo, 9),
            new vscode.Position(lineNo, include[2] + 9)),
          normalizeLink(document, include[0], base))
        documentLink.tooltip = localize('documentLink.tooltip', 'Open file') + ' ' + include[0]
        results.push(documentLink)
      })
    }
    return results
  }
}
