import * as path from 'node:path'
import * as vscode from 'vscode'
import { OpenDocumentLinkCommand } from '../commands/index.js'
import { t as l10nT } from '../core/l10n.js'
import { isSchemeBlacklisted } from '../core/linkSanitizer.js'
import { getUriForLinkWithKnownExternalScheme } from '../core/links.js'
import { similarArrayMatch } from '../lib/similarArrayMatch.js'
import { AsciidocIncludeItemsLoader } from './asciidoctor/asciidocLoader.js'
import { getReferenceLinesFromDocument } from './completion/crossReferences.js'

/**
 * Reference: https://gist.github.com/dperini/729294
 */
// eslint-disable-next-line max-len
// A leading backslash escapes the URL in AsciiDoc (it is rendered literally and
// must not become a link), so a backslash-prefixed URL is excluded here.
const urlRx =
  /(?<=|link|<|[>()[\];"'])(?<!\\)(?:https?|file|ftp|irc):\/\/[^\s[\]]+/gm
const inlineAnchorRx = /^\[\[(?<id>[^,]+)(?:,[^\]]+)*]]$/m
const xrefRx = /xref:(?<target>[^#|^[]+)(?<fragment>#[^[]+)?\[[^\]]*]/gi
// `link:target[...]` to a file (URLs are matched by `urlRx` instead). The target
// is a path that may carry a `#fragment`; spaces, `#` and `[` end it.
const linkRx = /link:(?<target>[^#\s[]+)(?<fragment>#[^\s[]+)?\[[^\]]*]/gi
// Shorthand internal cross reference: `<<target>>` or `<<target,link text>>`.
// `target` is an id or a reftext (a section title); the optional link text after
// the first comma is ignored for navigation.
const internalRefRx = /<<(?<target>[^,>]+)(?:,[^>]*)?>>/g

function normalizeLink(
  document: vscode.TextDocument,
  link: string,
  base: string,
): vscode.Uri {
  const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link)
  if (externalSchemeUri) {
    return externalSchemeUri
  }

  // Assume it must be a relative or absolute file path. We only parse `link` to
  // split it into a path and a fragment; the resulting URI is never used as a
  // webview resource. A neutral, non-special scheme is prepended to avoid the
  // "scheme is missing" parse warning while keeping the path verbatim — `file`,
  // `http` and `https` must NOT be used here as they make `Uri.parse` prepend a
  // leading slash to relative paths (and turn an empty path into `/`).
  const tempUri = vscode.Uri.parse(`adoc-link:${link}`)

  let resourcePath
  if (!tempUri.path) {
    resourcePath = document.uri.path
  } else if (link[0] === '/') {
    resourcePath = tempUri.path
  } else {
    resourcePath = path.join(base, tempUri.path)
  }
  const sanitizedResourcePath = isSchemeBlacklisted(link) ? '#' : resourcePath
  return OpenDocumentLinkCommand.createCommandUri(
    sanitizedResourcePath,
    tempUri.fragment,
  )
}

/**
 * Build a link for a cross reference that targets the current document. The
 * anchor id is resolved to a source line — first through the inline `[[id]]`
 * anchors scanned from the text, then through Asciidoctor's reference catalog
 * (which also covers sections and block ids) — so the editor can scroll to it.
 * When the line is unknown, the bare id is passed through so the command can
 * still look it up in the table of contents.
 */
function buildSameDocumentXrefLink(
  textDocument: vscode.TextDocument,
  range: vscode.Range,
  anchorId: string,
  anchors: { [key: string]: { lineNumber: number } },
  referenceLines: Map<string, number>,
): vscode.DocumentLink {
  const anchorLine = anchors[`${textDocument.uri.path}#${anchorId}`]?.lineNumber
  const line = anchorLine ?? referenceLines.get(anchorId)
  const fragment = line !== undefined ? `L${line}` : anchorId
  const documentLink = new vscode.DocumentLink(
    range,
    OpenDocumentLinkCommand.createCommandUri(textDocument.uri.path, fragment),
  )
  documentLink.tooltip = l10nT('links.navigate.follow')
  return documentLink
}

export default class LinkProvider implements vscode.DocumentLinkProvider {
  constructor(
    private readonly asciidocIncludeItemsLoader: AsciidocIncludeItemsLoader,
  ) {}

  public async provideDocumentLinks(
    textDocument: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.DocumentLink[]> {
    // includes from the reader are resolved correctly but the line numbers may be offset and not exactly match the document
    let baseDocumentProcessorIncludes =
      await this.asciidocIncludeItemsLoader.getIncludeItems(textDocument)
    const includeDirective = /^(\\)?include::([^[]+)\[([^\n]+)?]$/
    // get includes from document text. These may be inside ifeval or ifdef but the line numbers are correct.
    const baseDocumentRegexIncludes = new Map()
    const results: vscode.DocumentLink[] = []
    const anchors: { [key: string]: { lineNumber: number } } = {}
    const xrefProxies: ((anchors: {
      [key: string]: { lineNumber: number }
    }) => vscode.DocumentLink)[] = []
    // Source line of every cross-reference target (sections — including their
    // auto-generated ids —, blocks and anchors) so a same-document `xref:` can
    // navigate to the target instead of being mistaken for a file path.
    const referenceLines = getReferenceLinesFromDocument(
      await this.asciidocIncludeItemsLoader.load(textDocument),
    )
    const base = textDocument.uri.path.substring(
      0,
      textDocument.uri.path.lastIndexOf('/'),
    )
    for (
      let lineNumber = 0;
      lineNumber < textDocument.lineCount;
      lineNumber++
    ) {
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
            const url = urlFound[0].replace(/[,.;?!:)>]+$/, '')
            let targetUri: vscode.Uri
            try {
              targetUri = vscode.Uri.parse(url)
            } catch {
              // A malformed URL would make `Uri.parse` throw and abort the whole
              // provider (every link on the page would be lost); skip it instead.
              continue
            }
            const documentLink = new vscode.DocumentLink(
              new vscode.Range(
                new vscode.Position(lineNumber, index),
                new vscode.Position(lineNumber, url.length + index),
              ),
              targetUri,
            )
            documentLink.tooltip = l10nT('links.navigate.follow')
            results.push(documentLink)
          }
        }
      }
      if (line.startsWith('[[') && line.endsWith(']]')) {
        const inlineAnchorFound = line.match(inlineAnchorRx)
        if (inlineAnchorFound) {
          const inlineAnchorId = inlineAnchorFound.groups!.id
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
            const target = xrefFound.groups!.target
            const fragment = xrefFound.groups!.fragment || ''
            const originalTarget = `${target}${fragment}`
            const range = new vscode.Range(
              // exclude xref: prefix
              new vscode.Position(lineNumber, index + 5),
              new vscode.Position(
                lineNumber,
                originalTarget.length + index + 5,
              ),
            )
            // Per AsciiDoc, a macro target with no `#` fragment is an id within
            // the current document unless it contains a dot (then it is another
            // document). With a fragment it is an interdocument reference whose
            // path may still resolve to the current document.
            const isSameDocumentId = fragment === '' && !target.includes('.')
            let targetUri
            if (path.isAbsolute(target)) {
              targetUri = vscode.Uri.parse(target)
            } else {
              targetUri = vscode.Uri.parse(base + '/' + target)
            }
            if (isSameDocumentId) {
              const anchorId = target
              xrefProxies.push((anchors) =>
                buildSameDocumentXrefLink(
                  textDocument,
                  range,
                  anchorId,
                  anchors,
                  referenceLines,
                ),
              )
            } else if (targetUri.path === textDocument.uri.path) {
              const anchorId = fragment.replace(/^#/, '')
              xrefProxies.push((anchors) =>
                buildSameDocumentXrefLink(
                  textDocument,
                  range,
                  anchorId,
                  anchors,
                  referenceLines,
                ),
              )
            } else {
              const documentLink = new vscode.DocumentLink(
                range,
                normalizeLink(textDocument, `${target}${fragment}`, base),
              )
              documentLink.tooltip = l10nT(
                'documentLink.openFile.tooltip',
                target,
              )
              results.push(documentLink)
            }
          }
        }
      }
      if (line.includes('link:')) {
        for (const linkFound of line.matchAll(linkRx)) {
          const index = linkFound.index
          const target = linkFound.groups!.target
          const fragment = linkFound.groups!.fragment || ''
          // URLs (`link:https://…[]`) are already linked through `urlRx`; only
          // add navigation for links that point at a local file.
          if (getUriForLinkWithKnownExternalScheme(target)) {
            continue
          }
          const originalTarget = `${target}${fragment}`
          const range = new vscode.Range(
            // exclude the `link:` prefix
            new vscode.Position(lineNumber, index + 5),
            new vscode.Position(lineNumber, originalTarget.length + index + 5),
          )
          let targetUri
          if (path.isAbsolute(target)) {
            targetUri = vscode.Uri.parse(target)
          } else {
            targetUri = vscode.Uri.parse(base + '/' + target)
          }
          if (targetUri.path === textDocument.uri.path) {
            // A `link:` back to the current file (with a `#fragment`): navigate
            // within the document like a cross reference.
            const anchorId = fragment.replace(/^#/, '')
            xrefProxies.push((anchors) =>
              buildSameDocumentXrefLink(
                textDocument,
                range,
                anchorId,
                anchors,
                referenceLines,
              ),
            )
          } else {
            const documentLink = new vscode.DocumentLink(
              range,
              normalizeLink(textDocument, originalTarget, base),
            )
            documentLink.tooltip = l10nT(
              'documentLink.openFile.tooltip',
              target,
            )
            results.push(documentLink)
          }
        }
      }
      if (line.includes('<<')) {
        for (const internalRefFound of line.matchAll(internalRefRx)) {
          const index = internalRefFound.index
          const target = internalRefFound.groups!.target
          // An interdocument shorthand (`<<file.adoc#id>>`) is left to the
          // xref/file handling above; here we only navigate same-document
          // references (an id, an auto-generated section id, or a reftext).
          if (target.includes('#')) {
            continue
          }
          const range = new vscode.Range(
            // span only the target, not the `<<` / `>>` delimiters
            new vscode.Position(lineNumber, index + 2),
            new vscode.Position(lineNumber, index + 2 + target.length),
          )
          xrefProxies.push((anchors) =>
            buildSameDocumentXrefLink(
              textDocument,
              range,
              target,
              anchors,
              referenceLines,
            ),
          )
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
      }),
    )

    // update line items in reader results
    baseDocumentProcessorIncludes = baseDocumentProcessorIncludes.map(
      (entry) => {
        return {
          ...entry,
          index: betterIncludeMatching[entry.index],
        }
      },
    )

    // create include links
    if (baseDocumentProcessorIncludes) {
      baseDocumentProcessorIncludes.forEach((entry) => {
        const lineNo = entry.position - 1
        const documentLink = new vscode.DocumentLink(
          new vscode.Range(
            // don't link to the "include::" part or the square bracket contents
            new vscode.Position(lineNo, 9),
            new vscode.Position(lineNo, entry.length + 9),
          ),
          normalizeLink(textDocument, entry.name, base),
        )
        documentLink.tooltip = l10nT(
          'documentLink.openFile.tooltip',
          entry.name,
        )
        results.push(documentLink)
      })
    }
    return results
  }
}
