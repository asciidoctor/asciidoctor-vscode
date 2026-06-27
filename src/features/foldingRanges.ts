/*
 * Pure (VS Code-independent) folding logic so it can be unit-tested without the
 * extension host. `foldingProvider.ts` maps these results onto
 * `vscode.FoldingRange`/`vscode.FoldingRangeKind`.
 */

export enum FoldKind {
  Region = 'region',
  Comment = 'comment',
}

export interface SimpleFoldingRange {
  start: number
  end: number
  kind: FoldKind
}

// Delimited blocks whose opening and closing delimiter lines are a run of four
// or more identical characters: example (`====`), listing (`----`),
// literal (`....`), sidebar (`****`), quote/verse (`____`), passthrough
// (`++++`) and comment (`////`). See
// https://docs.asciidoctor.org/asciidoc/latest/blocks/delimited/
const delimitedBlockRx = /^(={4,}|-{4,}|\.{4,}|\*{4,}|_{4,}|\+{4,}|\/{4,})$/
// Table delimiters: PSV (`|===`), CSV (`,===`), DSV (`:===`) and the special
// `!===` used for cells nested inside an AsciiDoc table cell.
const tableBlockRx = /^[|,:!]={3,}$/

interface DelimiterInfo {
  // Whether the block content is verbatim (listing, literal, passthrough,
  // comment, table). Inside a verbatim block, lines that look like delimiters
  // (or `//` comments, `:` attributes) are content and must be ignored until
  // the matching closing delimiter.
  verbatim: boolean
  kind: FoldKind
}

/**
 * Classify a line as the delimiter of an AsciiDoc delimited block, or return
 * `undefined` if it is not a delimiter. Open blocks (`--`) and tables
 * (`|===`, …) are handled alongside the four-or-more-character runs.
 */
export function classifyDelimiter(lineText: string): DelimiterInfo | undefined {
  // Open block: a line of exactly two hyphens. Its content is parsed, so it is
  // not verbatim and can contain other (nested) delimited blocks.
  if (lineText === '--') {
    return { verbatim: false, kind: FoldKind.Region }
  }
  if (delimitedBlockRx.test(lineText)) {
    switch (lineText[0]) {
      case '/':
        return { verbatim: true, kind: FoldKind.Comment }
      case '-': // listing
      case '.': // literal
      case '+': // passthrough
        return { verbatim: true, kind: FoldKind.Region }
      default: // `=` example, `*` sidebar, `_` quote/verse
        return { verbatim: false, kind: FoldKind.Region }
    }
  }
  if (tableBlockRx.test(lineText)) {
    return { verbatim: true, kind: FoldKind.Region }
  }
  return undefined
}

/**
 * Compute folding ranges for AsciiDoc blocks in a single verbatim-aware pass:
 *
 * - Delimited blocks (example, listing, literal, sidebar, quote, passthrough,
 *   comment, open and table). A stack tracks nesting: a verbatim block
 *   (listing, literal, passthrough, comment, table) swallows any inner
 *   delimiter-looking line until its own closing delimiter, while a compound
 *   block (example, sidebar, quote, open) lets nested blocks fold too.
 * - Runs of consecutive single-line comments (`//`).
 * - Runs of consecutive document attributes (`:name: value`).
 *
 * Comment and attribute runs are only detected outside verbatim blocks, and a
 * delimiter line (e.g. the `////` opening a comment block) never joins a `//`
 * comment run — that conflation used to fold from a preceding `//` line down to
 * the comment block's closing delimiter. Unterminated delimited blocks fold to
 * the end of the document.
 */
export function getBlockFoldingRanges(
  lines: readonly string[],
): SimpleFoldingRange[] {
  const foldingRanges: SimpleFoldingRange[] = []
  const stack: {
    delimiter: string
    startIndex: number
    info: DelimiterInfo
  }[] = []
  const lineCount = lines.length

  // Open runs of `//` comments and `:` attributes (-1 when none is open). A run
  // becomes a fold only when it spans more than one line, matching the editor's
  // behavior for grouped comments/attributes.
  let commentRunStart = -1
  let attributeRunStart = -1
  // `endExclusive` is the index of the line that ended the run (or lineCount at
  // end of document); the run therefore covers up to `endExclusive - 1`.
  const closeCommentRun = (endExclusive: number) => {
    if (commentRunStart >= 0) {
      const end = endExclusive - 1
      if (end > commentRunStart) {
        foldingRanges.push({
          start: commentRunStart,
          end,
          kind: FoldKind.Comment,
        })
      }
      commentRunStart = -1
    }
  }
  const closeAttributeRun = (endExclusive: number) => {
    if (attributeRunStart >= 0) {
      const end = endExclusive - 1
      if (end > attributeRunStart) {
        foldingRanges.push({
          start: attributeRunStart,
          end,
          kind: FoldKind.Region,
        })
      }
      attributeRunStart = -1
    }
  }

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
    const rawLine = lines[lineIndex]
    // A delimiter must start at column 0; trailing whitespace is tolerated.
    const lineText = rawLine.trimEnd()
    const current = stack[stack.length - 1]

    if (current) {
      if (lineText === current.delimiter) {
        // Matching closing delimiter: close the innermost open block. It also
        // breaks any comment/attribute run that was open inside a compound
        // block.
        closeCommentRun(lineIndex)
        closeAttributeRun(lineIndex)
        stack.pop()
        foldingRanges.push({
          start: current.startIndex,
          end: lineIndex,
          kind: current.info.kind,
        })
        continue
      }
      if (current.info.verbatim) {
        // Inside a verbatim block: everything but the closing delimiter is
        // content, so no comment/attribute run can be open here.
        continue
      }
    }

    const info = classifyDelimiter(lineText)
    if (info) {
      // A delimiter opens a new block and breaks any comment/attribute run.
      closeCommentRun(lineIndex)
      closeAttributeRun(lineIndex)
      stack.push({ delimiter: lineText, startIndex: lineIndex, info })
      continue
    }

    // Single-line comment run (`//`, but not a `////` delimiter — handled above).
    if (rawLine.startsWith('//')) {
      if (commentRunStart < 0) {
        commentRunStart = lineIndex
      }
    } else {
      closeCommentRun(lineIndex)
    }

    // Document attribute run (`:name:`, but not a `:===` table — handled above).
    if (rawLine.startsWith(':')) {
      if (attributeRunStart < 0) {
        attributeRunStart = lineIndex
      }
    } else {
      closeAttributeRun(lineIndex)
    }
  }

  // End of document: close any open comment/attribute run…
  closeCommentRun(lineCount)
  closeAttributeRun(lineCount)
  // …and fold unterminated delimited blocks to the last line.
  for (const block of stack) {
    foldingRanges.push({
      start: block.startIndex,
      end: lineCount - 1,
      kind: block.info.kind,
    })
  }
  return foldingRanges
}
