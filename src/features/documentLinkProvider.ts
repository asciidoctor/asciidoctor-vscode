/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path'
import * as vscode from 'vscode'
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink'
import { getUriForLinkWithKnownExternalScheme } from '../util/links'
import { AsciidocParser } from '../asciidocParser'
import { similarArrayMatch } from '../similarArrayMatch'
import { isSchemeBlacklisted } from '../linkSanitizer'

const processor = require('@asciidoctor/core')()

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

  let resourcePath = tempUri.path
  if (!tempUri.path) {
    resourcePath = document.uri.path
  } else if (tempUri.path[0] === '/') {
    const root = vscode.workspace.getWorkspaceFolder(document.uri)
    if (root) {
      resourcePath = path.join(root.uri.fsPath, tempUri.path)
    }
  } else {
    resourcePath = path.join(base, tempUri.path)
  }
  resourcePath = isSchemeBlacklisted(link) ? '#' : resourcePath
  return OpenDocumentLinkCommand.createCommandUri(resourcePath, tempUri.fragment)
}

export default class LinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink[] {
    const base = path.dirname(document.uri.fsPath)
    const text = document.getText()

    // first handle inline links
    const adParser = new AsciidocParser(document.uri.fsPath)
    adParser.convertUsingJavascript(text, document, false, 'html', true)
    const linkItems = adParser.linkItems
    const asciidoctorRegexLinks = {
      inlineLinkRx: new RegExp(processor.InlineLinkRx.source, processor.InlineLinkRx.flags + 'g'),
      inlineLinkMacroRx: new RegExp(processor.InlineLinkMacroRx.source, processor.InlineLinkMacroRx.flags + 'g'),
    }

    const results: vscode.DocumentLink[] = []
    Object.entries(linkItems).forEach(([lineNo, links]) => {
      const lineAsNumber = parseInt(lineNo) - 1
      const lineLinks = []
      Object.values(asciidoctorRegexLinks).forEach((linkRegex) => {
        const linksFound = adParser.document.getSourceLines()[lineAsNumber].matchAll(linkRegex)
        for (const match of linksFound) {
          lineLinks.push([match.index, match.index + match[0].length])
        }
      })
      const sortedLineLinks = lineLinks.sort((first, second) => first[0] - second[0])
      links.forEach((link, index) => {
        link.match = sortedLineLinks[index]
      })

      links.forEach((link) => {
        try {
          if (link.match) {
            results.push(new vscode.DocumentLink(
              new vscode.Range(new vscode.Position(lineAsNumber, link.match[0]),
                new vscode.Position(lineAsNumber, link.match[1])),
              normalizeLink(document, link.target, base)))
          }
        } catch (err) {
          // ignore unmatchable links but something is going wrong if this occurs
          console.log(err)
        }
      })
    })

    // then handle includes
    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentIncludeItems = adParser.baseDocumentIncludeItems
    const includeDirectives = new RegExp(processor.IncludeDirectiveRx.source, processor.IncludeDirectiveRx.flags + 'g')
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    // the length is used to match the line correctly
    const lines = adParser.document.getSourceLines()
    const includeCandidates = new Map()
    lines.forEach((line, index) => {
      if (includeDirectives.test(line)) {
        includeCandidates.set(index, line.length)
      }
    })

    // find a corrected mapping for line numbers
    const betterMatching = similarArrayMatch(
      Array.from(includeCandidates.keys()),
      baseDocumentIncludeItems.map((elem) => {
        return elem[1]
      }))

    // update line items in reader results
    baseDocumentIncludeItems = baseDocumentIncludeItems.map((elem, index) => {
      elem[1] = betterMatching[index]
      return elem
    })

    // create document links
    if (baseDocumentIncludeItems) {
      baseDocumentIncludeItems.forEach((include) => {
        const lineNo = include[1]
        results.push(new vscode.DocumentLink(
          new vscode.Range(
            new vscode.Position(lineNo, 0),
            new vscode.Position(lineNo, include[2] + includeCandidates.get(lineNo))),
          normalizeLink(document, include[0], base)))
      })
    }
    return results
  }
}
