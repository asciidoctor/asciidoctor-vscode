// Pure helpers backing the xref/`<<` completion. Kept free of any `vscode`
// dependency so they can be unit-tested in isolation; the provider only wires
// these to the editor (document lookup, file globbing, CompletionItem creation).

import * as path from 'node:path'

/**
 * Whether `keyword` (e.g. `xref:` or `<<`) ends exactly at the cursor, i.e. the
 * user just typed it and a completion should be offered.
 */
export function shouldProvideCompletion(
  textFullLine: string,
  character: number,
  keyword: string,
): boolean {
  const occurrence = textFullLine.indexOf(keyword, character - keyword.length)
  return occurrence === character - keyword.length
}

export interface CrossRefQuery {
  /** The anchor id fragment typed after the macro, used to filter candidates. */
  search: string
  /** Whether the macro brackets (`[`) are already present after the cursor. */
  hasBracket: boolean
}

/**
 * Parse what the user typed right after `xref:` to drive cross reference
 * completion: the id fragment to match and whether the brackets are present.
 */
export function parseCrossRefQuery(
  textFullLine: string,
  character: number,
): CrossRefQuery {
  const textLine = textFullLine.substring(character).split(' ')[0]
  return {
    search: textLine.split('[')[0],
    hasBracket: textLine.includes('['),
  }
}

/** Whether the anchor `label` matches the query typed after the macro. */
export function matchesCrossRefQuery(label: string, search: string): boolean {
  return !search || label.match(search) !== null
}

export interface CrossRefLabelPaths {
  /** File system path of the document being edited. */
  currentFilePath: string
  /** File system path of the file declaring the anchor. */
  targetFilePath: string
}

/**
 * Build the completion label for an anchor reachable through `xref:`. Within the
 * same file the bare id is used; otherwise it is prefixed with the path of the
 * target file relative to the current document. The macro brackets are appended
 * unless they are already typed.
 */
export function buildCrossRefLabel(
  label: string,
  hasBracket: boolean,
  { currentFilePath, targetFilePath }: CrossRefLabelPaths,
): string {
  const labelText = hasBracket ? label : `${label}[]`
  if (targetFilePath === currentFilePath) {
    return labelText
  }
  const relativePath = path.relative(
    path.dirname(currentFilePath),
    targetFilePath,
  )
  return `${relativePath}#${labelText}`
}

/**
 * Extract the id fragment typed after `<<` for internal cross references, used
 * to filter the anchors declared in the current document.
 */
export function parseInternalRefQuery(
  textFullLine: string,
  character: number,
): string {
  const indexOfNextWhiteSpace = textFullLine.includes(' ', character)
    ? textFullLine.indexOf(' ', character)
    : textFullLine.length
  return textFullLine.substring(
    textFullLine.lastIndexOf('<', character + 1) + 1,
    indexOfNextWhiteSpace,
  )
}
