import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'

// Toggle an AsciiDoc inline formatting marker (`*` bold, `_` italic, `` ` ``
// monospace) over the selection(s), like the bold/italic shortcuts of a word
// processor.
//
// AsciiDoc has two forms of inline formatting:
//   - constrained — a single marker (`*bold*`), which only takes effect when the
//     marks sit on a word boundary (preceded/followed by whitespace, punctuation
//     or the line edge);
//   - unconstrained — a doubled marker (`**bold**`), which works anywhere,
//     including in the middle of a word (`fo**ob**ar`).
// When wrapping, the constrained form is used where it is valid and the
// unconstrained form is used otherwise (the selection is glued to a word
// character). When unwrapping, either form is recognised — whether the marks are
// inside the selection or immediately around it (e.g. the word is selected but
// the surrounding marks are not).
export async function toggleInlineFormatting(marker: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const document = editor.document
  const double = marker + marker

  // Empty selection with no word under the cursor: there is nothing to wrap, so
  // insert an empty marker pair and drop the cursor between the two markers so
  // the user can type the emphasised text. Handled on its own because, unlike
  // wrapping, it needs the resulting cursor to be moved back inside the pair.
  if (editor.selections.length === 1 && editor.selection.isEmpty) {
    const position = editor.selection.active
    if (!document.getWordRangeAtPosition(position)) {
      const mark =
        isWordChar(charBefore(document, position)) ||
        isWordChar(charAfter(document, position))
          ? double
          : marker
      await editor.edit((editBuilder) =>
        editBuilder.insert(position, mark + mark),
      )
      const insideMarkers = position.translate(0, mark.length)
      editor.selection = new vscode.Selection(insideMarkers, insideMarkers)
      return
    }
  }

  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      const { range, text } = computeToggle(document, selection, marker)
      editBuilder.replace(range, text)
    }
  })
}

interface ToggleEdit {
  range: vscode.Range
  text: string
}

function computeToggle(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  marker: string,
): ToggleEdit {
  const double = marker + marker

  // Format the selection, or the word under the cursor when nothing is selected.
  const wordRange = selection.isEmpty
    ? document.getWordRangeAtPosition(selection.active)
    : undefined
  const range = wordRange ?? selection
  const text = document.getText(range)

  // Unwrap when the marks are inside the range (the user selected `**bold**`).
  // The doubled form is tested first since it also starts/ends with the marker.
  if (isWrappedWith(text, double)) {
    return {
      range,
      text: text.slice(double.length, text.length - double.length),
    }
  }
  if (isWrappedWith(text, marker)) {
    return {
      range,
      text: text.slice(marker.length, text.length - marker.length),
    }
  }

  // Unwrap when the marks are immediately around the range (the user selected
  // `bold`, but it is written `**bold**`/`*bold*`).
  if (
    charsBefore(document, range.start, double.length) === double &&
    charsAfter(document, range.end, double.length) === double
  ) {
    return {
      range: new vscode.Range(
        range.start.translate(0, -double.length),
        range.end.translate(0, double.length),
      ),
      text,
    }
  }
  if (
    charsBefore(document, range.start, marker.length) === marker &&
    charsAfter(document, range.end, marker.length) === marker
  ) {
    return {
      range: new vscode.Range(
        range.start.translate(0, -marker.length),
        range.end.translate(0, marker.length),
      ),
      text,
    }
  }

  // Not wrapped → wrap. Keep any leading/trailing whitespace outside the marks
  // (constrained formatting cannot begin or end with a space) and choose the
  // form from the characters the marks would actually touch.
  const leading = text.slice(0, text.length - text.trimStart().length)
  const trailing = text.slice(text.trimEnd().length)
  const core = text.slice(leading.length, text.length - trailing.length)
  const leftNeighbor =
    leading.length > 0 ? leading : charBefore(document, range.start)
  const rightNeighbor =
    trailing.length > 0 ? trailing : charAfter(document, range.end)
  const mark =
    isWordChar(leftNeighbor) || isWordChar(rightNeighbor) ? double : marker
  return { range, text: `${leading}${mark}${core}${mark}${trailing}` }
}

function isWrappedWith(text: string, marker: string): boolean {
  return (
    text.length >= marker.length * 2 &&
    text.startsWith(marker) &&
    text.endsWith(marker)
  )
}

// A word constituent — constrained formatting marks may not sit directly against
// one, so adjacency to a word character forces the unconstrained form.
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /\w/.test(char.charAt(char.length - 1))
}

function charBefore(
  document: vscode.TextDocument,
  position: vscode.Position,
): string | undefined {
  return position.character === 0
    ? undefined
    : charsBefore(document, position, 1)
}

function charAfter(
  document: vscode.TextDocument,
  position: vscode.Position,
): string | undefined {
  const after = charsAfter(document, position, 1)
  return after.length === 0 ? undefined : after
}

// Up to `count` characters immediately before `position` on the same line
// (fewer near the line start).
function charsBefore(
  document: vscode.TextDocument,
  position: vscode.Position,
  count: number,
): string {
  const start = position.translate(0, -Math.min(count, position.character))
  return document.getText(new vscode.Range(start, position))
}

// Up to `count` characters immediately after `position` on the same line (fewer
// near the line end).
function charsAfter(
  document: vscode.TextDocument,
  position: vscode.Position,
  count: number,
): string {
  const lineEnd = document.lineAt(position.line).range.end
  const end = position.translate(0, count)
  return document.getText(
    new vscode.Range(position, end.isAfter(lineEnd) ? lineEnd : end),
  )
}

export class ToggleBoldCommand implements Command {
  public readonly id = 'asciidoc.toggleBold'

  public execute() {
    return toggleInlineFormatting('*')
  }
}

export class ToggleItalicCommand implements Command {
  public readonly id = 'asciidoc.toggleItalic'

  public execute() {
    return toggleInlineFormatting('_')
  }
}

export class ToggleMonospaceCommand implements Command {
  public readonly id = 'asciidoc.toggleMonospace'

  public execute() {
    return toggleInlineFormatting('`')
  }
}
