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

    // lines for links do not always line up nicely in the Asciidoctor AST. This seems to be true
    // inside table cells for instance. So we regex parse the document and match this with the
    // converter output.
    const baseDocumentConverterLinks = adParser.linkItems

    // These regexes are take directly from asciidoctor.js during a debug session to handle substitutions
    // must have g flag or while loop below may be infinite...
    const asciidoctorRegexLinks: AsciidoctorLinkRegexes = {
      // eslint-disable-next-line prefer-regex-literals
      inlineLinkRx: new RegExp('(^|link:|[ \\t]|&lt;|[>\\(\\)\\[\\];"\'])(\\\\?(?:https?|file|ftp|irc):\\/\\/[^\\s\\[\\]<]*([^\\s.,\\[\\]<]))(?:\\[(|[\\s\\S]*?[^\\\\])\\])?', 'mg'),
      // eslint-disable-next-line prefer-regex-literals
      inlineLinkMacroRx: new RegExp('\\\\?(?:link|(mailto)):(|[^:\\s\\[][^\\s\\[]*)\\[(|[\\s\\S]*?[^\\\\])\\]', 'mg'),
      // eslint-disable-next-line prefer-regex-literals
      inlineXrefRx: new RegExp('\\\\?(?:&lt;&lt;([A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u037F\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u0…0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0DE6-\\u0DEF\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uA9F0-\\uA9F9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F#/.:{][\\s\\S]*?)\\[(?:\\]|([\\s\\S]*?[^\\\\])\\]))', 'mg'),
    }

    const lines = adParser.document.getSourceLines()
    const docLinkCandidates = new Map()
    lines.forEach((line, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_regexName, linkRx] of Object.entries(asciidoctorRegexLinks)) {
        let linkMatch: any
        while ((linkMatch = linkRx.exec(line)) !== null) {
          const newEntry = [linkMatch.index, linkRx.lastIndex, linkMatch[0]]
          if (!docLinkCandidates.has(index)) {
            docLinkCandidates.set(index, [newEntry])
          } else {
            const currentCandidate = docLinkCandidates.get(index)
            currentCandidate.push(newEntry)
            docLinkCandidates.set(index, currentCandidate)
          }
        }
      }
    })

    // sort by order of appearance in each line so they line up with the converter output
    const baseDocumentRegexLinks = new Map()
    docLinkCandidates.forEach((lineCandidates, lineNo) => {
      const sortedLineCandidates = lineCandidates.sort((first, second) => first[0] - second[0])
      let matchCounter = 0
      sortedLineCandidates.forEach((candidate) => {
        baseDocumentRegexLinks.set(lineNo + matchCounter, candidate)
        // More than 1000 items in a line deserves a mismatch
        matchCounter += 0.001
      })
    })

    // allocate an order to the converter output
    // makes incorrect assumption that converter order is strictly left to right per line
    let oldItemNumber = -1
    let offset = 0
    for (const item of baseDocumentConverterLinks) {
      if (item.lineNo === oldItemNumber) {
        offset += 0.001
      } else {
        offset = 0
      }
      oldItemNumber = item.lineNo
      item.lineNo = item.lineNo + offset
    }

    // find a corrected mapping for line numbers
    const betterLinkMatches = similarArrayMatch(
      Array.from(baseDocumentRegexLinks.keys()),
      baseDocumentConverterLinks.map((item) => item.lineNo))

    baseDocumentConverterLinks.forEach((link, idx) => {
      link.lineNo = betterLinkMatches[idx]
      try {
        const lineNumber = Math.trunc(link.lineNo)
        const startPos = baseDocumentRegexLinks.get(link.lineNo)[0]
        const endPos = baseDocumentRegexLinks.get(link.lineNo)[1]
        results.push(new vscode.DocumentLink(
          new vscode.Range(new vscode.Position(lineNumber, startPos),
            new vscode.Position(lineNumber, endPos)),
          normalizeLink(document, link.target, base)))
      } catch (err) {
      // ignore unmatchable links but something is going wrong if this occurs
        console.log(err)
      }
    })

    // then handle includes
    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentProcessorIncludes = adParser.baseDocumentIncludeItems
    const includeDirective = /^(\\)?include::([^[][^[]*)\[([^\n]+)?\]$/
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    // the length is used to match the line correctly
    const baseDocumentRegexIncludes = new Map()
    lines.forEach((line, index) => {
      if (includeDirective.test(line)) {
        baseDocumentRegexIncludes.set(index, line.length)
      }
    })

    // find a corrected mapping for line numbers
    const betterMatching = similarArrayMatch(
      Array.from(baseDocumentRegexIncludes.keys()),
      baseDocumentProcessorIncludes.map((elem) => {
        return elem[1]
      }))

    // update line items in reader results
    baseDocumentProcessorIncludes = baseDocumentProcessorIncludes.map((elem, index) => {
      elem[1] = betterMatching[index]
      return elem
    })

    // create document links
    if (baseDocumentProcessorIncludes) {
      baseDocumentProcessorIncludes.forEach((include) => {
        const lineNo = include[1]
        results.push(new vscode.DocumentLink(
          new vscode.Range(
            new vscode.Position(lineNo, 0),
            new vscode.Position(lineNo, include[2] + baseDocumentRegexIncludes.get(lineNo))),
          normalizeLink(document, include[0], base)))
      })
    }
    return results
  }
}
