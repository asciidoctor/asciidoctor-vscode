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
  public provideDocumentLinks (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink[] {
    const base = path.dirname(document.uri.fsPath)
    const text = document.getText()

    // first handle inline links
    const adParser = new AsciidocParser(document.uri.fsPath)
    adParser.convertUsingJavascript(text, document, false, 'html', true)

    const results: vscode.DocumentLink[] = []
    const asciidoctorRegexLinks = {
      // eslint-disable-next-line prefer-regex-literals
      inlineLinkRx: new RegExp('(^|link:|[ \\t]|&lt;|[>\\(\\)\\[\\];"\'])(\\\\?(?:https?|file|ftp|irc):\\/\\/[^\\s\\[\\]<]*([^\\s.,\\[\\]<]))(?:\\[(|[\\s\\S]*?[^\\\\])\\])?', 'mg'),
      // eslint-disable-next-line prefer-regex-literals
      inlineLinkMacroRx: new RegExp('\\\\?(?:link|(mailto)):(|[^:\\s\\[][^\\s\\[]*)\\[(|[\\s\\S]*?[^\\\\])\\]', 'mg'),
      // eslint-disable-next-line prefer-regex-literals
      inlineXrefRx: new RegExp('\\\\?(?:&lt;&lt;([A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u037F\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u0…0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0DE6-\\u0DEF\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uA9F0-\\uA9F9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F#/.:{][\\s\\S]*?)\\[(?:\\]|([\\s\\S]*?[^\\\\])\\]))', 'mg'),
    }
    const linkItems = adParser.linkItems
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
    // eslint-disable-next-line prefer-regex-literals, no-control-regex, no-useless-escape
    const includeDirectives = new RegExp('^(\\)?include::([^\[][^\[]*)\[([^\n]+)?\]$', 'g')
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
