/*
 * Pure (VS Code-independent) resolution of the `:imagesdir:` attribute at a
 * given location, so it can be unit-tested without the extension host.
 */

import { classifyDelimiter } from './foldingRanges.js'

// An `:imagesdir:` attribute entry, e.g. `:imagesdir: assets/images`. The unset
// form (`:imagesdir!:`) and a bare `:imagesdir:` both clear the value. The line
// is trimmed by the caller, so only the value is captured here.
const imagesDirAttributeRx = /^:imagesdir!?:(?:\s+(.+?))?\s*$/

/**
 * Find the value of the nearest `:imagesdir:` attribute entry declared *before*
 * `cursorOffset`. This is position-aware on purpose: the attribute can be
 * redefined in the document body and Asciidoctor applies the value in effect at
 * each location when rendering images, whereas `Document#getAttribute` only ever
 * reports the header value.
 *
 * Lines that sit inside a delimited block are ignored, because a line that looks
 * like `:imagesdir: …` is then verbatim content, not an attribute definition
 * (https://github.com/asciidoctor/asciidoctor-vscode/issues/879).
 *
 * Returns `undefined` when no applicable attribute entry is found, in which case
 * the caller should fall back to the value resolved by Asciidoctor itself (the
 * attribute may be set outside the document text, e.g. via `.asciidoctorconfig`).
 */
export function findImagesDirBeforeCursor(
  text: string,
  cursorOffset: number,
): string | undefined {
  // Track open delimited blocks so attribute-looking lines inside them are
  // ignored, mirroring `getBlockFoldingRanges`. A verbatim block (listing,
  // literal, passthrough, comment, table) swallows every inner line until its
  // matching closing delimiter; a compound block (example, sidebar, quote, open)
  // still allows nested blocks, and an attribute entry within it is genuine.
  const stack: { delimiter: string; verbatim: boolean }[] = []
  let result: string | undefined
  let offset = 0

  for (const rawLine of text.split('\n')) {
    const lineStart = offset
    // `+ 1` accounts for the `\n` consumed by the split; a trailing `\r` (CRLF)
    // stays in `rawLine` and is removed by `trimEnd()` below.
    offset += rawLine.length + 1
    // An attribute entry takes effect from its own line onward, so anything
    // starting at or after the cursor cannot influence the value at the cursor.
    if (lineStart >= cursorOffset) {
      break
    }

    // A delimiter (and an attribute entry) must start at column 0; trailing
    // whitespace is tolerated.
    const lineText = rawLine.trimEnd()
    const current = stack[stack.length - 1]
    if (current) {
      if (lineText === current.delimiter) {
        stack.pop()
        continue
      }
      if (current.verbatim) {
        continue
      }
    }

    const info = classifyDelimiter(lineText)
    if (info) {
      stack.push({ delimiter: lineText, verbatim: info.verbatim })
      continue
    }

    const match = imagesDirAttributeRx.exec(lineText)
    if (match) {
      // The nearest entry wins; an unset or empty value clears a previous one.
      result = match[1] ?? undefined
    }
  }

  return result
}
