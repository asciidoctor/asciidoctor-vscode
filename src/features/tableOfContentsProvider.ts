import { decode as htmlEntitiesDecode } from 'html-entities'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../core/document.js'
import { logger } from '../core/logger.js'
import { githubSlugifier, Slug } from '../lib/slugify.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'

export interface TocEntry {
  readonly slug: Slug
  readonly text: string
  readonly level: number
  readonly line: number
  readonly location: vscode.Location
}

export class TableOfContentsProvider {
  private toc?: TocEntry[]

  public constructor(
    private readonly document: SkinnyTextDocument,
    private readonly asciidocLoader: AsciidocLoader,
  ) {
    this.document = document
  }

  public async getToc(): Promise<TocEntry[]> {
    if (!this.toc) {
      try {
        this.toc = await this.buildToc(this.document)
      } catch (e) {
        logger.error(
          `Unable to build the Table Of Content for: ${this.document.fileName}`,
          e,
        )
        this.toc = []
      }
    }
    return this.toc
  }

  public async lookup(fragment: string): Promise<TocEntry | undefined> {
    const toc = await this.getToc()
    const slug = githubSlugifier.fromHeading(fragment)
    return toc.find((entry) => entry.slug.equals(slug))
  }

  private async buildToc(
    textDocument: SkinnyTextDocument,
  ): Promise<TocEntry[]> {
    const asciidocDocument = await this.asciidocLoader.load(textDocument)
    const lastLine = Math.max(textDocument.lineCount - 1, 0)

    // Lines (0-based) of the top-level `include::` directives in the host
    // document, in document order. A section that originates from an included
    // file reports a line number relative to *that* file, not to the host
    // document. We must not use such a line as-is: it breaks the monotonic
    // assumption below and used to produce a negative range that threw in
    // `textDocument.lineAt()`, wiping the entire outline (#936). Instead we
    // anchor every included section to the `include::` directive that pulled it
    // in — the Outline (powered by `DocumentSymbol`) can only reveal ranges
    // within the host document anyway, so pointing at the include is both safe
    // and the closest navigable location.
    const includeDirectiveLines = findIncludeDirectiveLines(textDocument)
    let includeCursor = 0
    let lastHostLine = 0
    let insideIncludeRun = false
    let currentIncludeLine = 0

    // A section belongs to the host document when its source file matches the
    // document's own file. Comparing the file (rather than testing the path
    // against `<stdin>`) is robust whether or not `docfile` is set: without it
    // both are `undefined`; with it both are the document's path. An included
    // section instead reports the included file. (Same rule as
    // `isFromMainDocument` in sourceLineMapping.)
    const mainFile = asciidocDocument.getSourceLocation()?.getFile()

    const toc = asciidocDocument
      .findBy({ context: 'section' })
      .map((section) => {
        const sourceFile = section.getSourceLocation()?.getFile()
        const fromInclude = sourceFile !== undefined && sourceFile !== mainFile

        let line: number
        if (fromInclude) {
          if (!insideIncludeRun) {
            // Start of a new run of included sections: consume the next
            // include directive located after the last host section we saw.
            while (
              includeCursor < includeDirectiveLines.length &&
              includeDirectiveLines[includeCursor] < lastHostLine
            ) {
              includeCursor++
            }
            currentIncludeLine =
              includeCursor < includeDirectiveLines.length
                ? includeDirectiveLines[includeCursor++]
                : lastHostLine
            insideIncludeRun = true
          }
          line = currentIncludeLine
        } else {
          const lineNumber = section.getLineNumber() // Asciidoctor is 1-based but can return 0 (probably a bug/limitation)
          line = lineNumber > 0 ? lineNumber - 1 : 0
          lastHostLine = line
          insideIncludeRun = false
        }

        // Defensive clamp: a malformed source map must never produce an
        // out-of-range line (it used to throw and clear the whole outline).
        line = Math.min(Math.max(line, 0), lastLine)

        return {
          slug: new Slug(section.getId()),
          text: htmlEntitiesDecode(section.getTitle()),
          level: section.getLevel(),
          line,
          location: new vscode.Location(
            textDocument.uri,
            new vscode.Position(line, 1),
          ),
        }
      })

    // Get full range of section
    return toc.map((entry, startIndex): TocEntry => {
      let end: number | undefined
      for (let i = startIndex + 1; i < toc.length; ++i) {
        if (toc[i].level <= entry.level) {
          end = toc[i].line - 1
          break
        }
      }
      let endLine = typeof end === 'number' ? end : lastLine
      if (endLine > lastLine) {
        endLine = lastLine
      }
      // A section never ends before it starts: included sections can share the
      // same anchor line, which would otherwise yield an inverted range.
      if (endLine < entry.line) {
        endLine = entry.line
      }
      return {
        ...entry,
        location: new vscode.Location(
          textDocument.uri,
          new vscode.Range(
            entry.location.range.start,
            new vscode.Position(
              endLine,
              textDocument.lineAt(endLine).range.end.character,
            ),
          ),
        ),
      }
    })
  }
}

/**
 * Lines (0-based) of the block-level `include::` directives in the document, in
 * source order. A directive sits at the start of a line, e.g.
 * `include::chapter.adoc[]`; an escaped `\include::…` is intentionally skipped.
 */
function findIncludeDirectiveLines(textDocument: SkinnyTextDocument): number[] {
  const lines = textDocument.getText().split(/\r?\n/)
  const directiveLines: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^include::[^[\]]+\[.*\]\s*$/.test(lines[i])) {
      directiveLines.push(i)
    }
  }
  return directiveLines
}
