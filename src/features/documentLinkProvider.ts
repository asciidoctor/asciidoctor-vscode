import * as path from 'path'
import * as vscode from 'vscode'
import { OpenDocumentLinkCommand } from '../commands'
import { getUriForLinkWithKnownExternalScheme } from '../util/links'
import { similarArrayMatch } from '../similarArrayMatch'
import { isSchemeBlacklisted } from '../linkSanitizer'
import * as nls from 'vscode-nls'
import { AsciidocIncludeItemsLoader } from '../asciidocLoader'

/**
 * Reference: https://gist.github.com/dperini/729294
 */
// eslint-disable-next-line max-len
const urlRx = /(?:(?:https?|ftp|irc):)?\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4])|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+[a-z\u00a1-\uffff]{2,}\.?)(?::\d{2,5})?(?:[/?#][^[]*)?/ig
const inlineAnchorRx = /^\[\[(?<id>[^,]+)(?:,[^\]]+)*]]$/m
const xrefRx = /xref:(?<target>[^#|^[]+)(?<fragment>#[^[]+)?\[[^\]]*]/ig
const localize = nls.loadMessageBundle()

function normalizeLink (
  document: vscode.TextDocument,
  link: string,
  base: string
): vscode.Uri {
  const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link)
  if (externalSchemeUri) {
    return externalSchemeUri
  }

  // Assume it must be a relative or absolute file path
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
  constructor (private readonly asciidocIncludeItemsLoader: AsciidocIncludeItemsLoader) {
  }

  public async provideDocumentLinks (textDocument: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentProcessorIncludes = await this.asciidocIncludeItemsLoader.getIncludeItems(textDocument)
    const includeDirective = /^(\\)?include::([^[]+)\[([^\n]+)?]$/
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    const baseDocumentRegexIncludes = new Map()
    const results: vscode.DocumentLink[] = []
    const anchors = {}
    const xrefProxies = []
    const base = textDocument.uri.path.substring(0, textDocument.uri.path.lastIndexOf('/'))
    for (let lineNumber = 0; lineNumber < textDocument.lineCount; lineNumber++) {
      const line = textDocument.lineAt(lineNumber).text
      const match = includeDirective.exec(line)
      if (match) {
        const includeReference = match[2]
        baseDocumentRegexIncludes.set(lineNumber, includeReference.length)
      }
      if (line.includes(':') && line.includes('://')) {
        const urlsFound = line.matchAll(urlRx)
        if (urlsFound) {
          for (const urlFound of urlsFound) {
            const index = urlFound.index
            const url = urlFound[0]
            const documentLink = new vscode.DocumentLink(
              new vscode.Range(
                new vscode.Position(lineNumber, index),
                new vscode.Position(lineNumber, url.length + index)
              ),
              vscode.Uri.parse(url)
            )
            documentLink.tooltip = localize('links.navigate.follow', 'follow link') // translation provided by VS code
            results.push(documentLink)
          }
        }
      }
      if (line.startsWith('[[') && line.endsWith(']]')) {
        const inlineAnchorFound = line.match(inlineAnchorRx)
        if (inlineAnchorFound) {
          const inlineAnchorId = inlineAnchorFound.groups.id
          anchors[`${textDocument.uri.path}#${inlineAnchorId}`] = {
            lineNumber: lineNumber + 1,
          }
        }
      }
      if (line.includes('xref:')) {
        const xrefsFound = line.matchAll(xrefRx)
        if (xrefsFound) {
          for (const xrefFound of xrefsFound) {
            const index = xrefFound.index
            const target = xrefFound.groups.target
            let fragment = xrefFound.groups.fragment || ''
            const originalTarget = `${target}${fragment}`
            let targetUri
            if (path.isAbsolute(target)) {
              targetUri = vscode.Uri.parse(target)
            } else {
              targetUri = vscode.Uri.parse(base + '/' + target)
            }
            if (targetUri.path === textDocument.uri.path) {
              xrefProxies.push((anchors) => {
                const anchorFound = anchors[`${targetUri.path}${fragment}`]
                if (anchorFound) {
                  fragment = `#L${anchorFound.lineNumber}`
                }
                const documentLink = new vscode.DocumentLink(
                  new vscode.Range(
                    // exclude xref: prefix
                    new vscode.Position(lineNumber, index + 5),
                    new vscode.Position(lineNumber, originalTarget.length + index + 5)
                  ),
                  normalizeLink(textDocument, `${target}${fragment}`, base)
                )
                documentLink.tooltip = localize('documentLink.openFile.tooltip', 'Open file {0}', target)
                return documentLink
              })
            } else {
              const documentLink = new vscode.DocumentLink(
                new vscode.Range(
                  new vscode.Position(lineNumber, index + 5),
                  new vscode.Position(lineNumber, originalTarget.length + index + 5)
                ),
                normalizeLink(textDocument, `${target}${fragment}`, base)
              )
              documentLink.tooltip = localize('documentLink.openFile.tooltip', 'Open file {0}', target)
              results.push(documentLink)
            }
          }
        }
      }
    }

    if (xrefProxies && xrefProxies.length > 0) {
      for (const xrefProxy of xrefProxies) {
        results.push(xrefProxy(anchors))
      }
    }

    // find a corrected mapping for line numbers
    const betterIncludeMatching = similarArrayMatch(
      Array.from(baseDocumentRegexIncludes.keys()),
      baseDocumentProcessorIncludes.map((entry) => {
        return entry.position
      })
    )

    // update line items in reader results
    baseDocumentProcessorIncludes = baseDocumentProcessorIncludes.map((entry) => {
      return {
        ...entry,
        index: betterIncludeMatching[entry.index],
      }
    })

    // create include links
    if (baseDocumentProcessorIncludes) {
      baseDocumentProcessorIncludes.forEach((entry) => {
        const lineNo = entry.position - 1
        const documentLink = new vscode.DocumentLink(
          new vscode.Range(
            // don't link to the "include::" part or the square bracket contents
            new vscode.Position(lineNo, 9),
            new vscode.Position(lineNo, entry.length + 9)),
          normalizeLink(textDocument, entry.name, base))
        documentLink.tooltip = localize('documentLink.openFile.tooltip', 'Open file {0}', entry.name)
        results.push(documentLink)
      })
    }
    return results
  }
}
