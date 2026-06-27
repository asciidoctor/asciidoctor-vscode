/**
 * A source-mapped block reduced to the only two facts the scroll mapping needs:
 * the 1-based line reported by Asciidoctor's sourcemap and the file that line
 * belongs to.
 */
export interface SourceMappedBlock {
  lineNumber: number
  file?: string
}

/**
 * Resolve the editor line each rendered block should be anchored to (its
 * `data-line-N`), accounting for `include::` directives.
 *
 * With `sourcemap: true`, a block pulled in from an included file reports its
 * line number *relative to that included file* (e.g. the first paragraph of an
 * include reports line 1, a table cell reports its line within the partial).
 * Emitting that verbatim inserts out-of-order anchors into the otherwise
 * ascending list of the active document's lines, which breaks the preview ⇄
 * editor scroll synchronization: the binary search and the linear interpolation
 * both assume anchors increase monotonically.
 *
 * The editor only ever shows a single line for an include — the `include::`
 * directive itself — so every block that does not positively belong to the main
 * document is anchored to the last line seen from the main document. The result
 * is additionally clamped to a running maximum so the returned sequence is
 * guaranteed non-decreasing even if Asciidoctor reports a block slightly out of
 * order (the only invariant the scroll mapping relies on).
 *
 * `blocks` must be in document (source) order, which is what `Document#findBy`
 * returns.
 *
 * @param blocks    source-mapped blocks, in document order
 * @param mainFile  file of the document being edited; any block from a different
 *                  file — or, when `mainFile` is known, with no recorded file
 *                  (e.g. table cells, which carry a line but no file) — is
 *                  treated as included. When `mainFile` is undefined (an unsaved
 *                  document) includes cannot be detected, so every block is
 *                  treated as belonging to the document.
 * @returns         the resolved line for each block, parallel to `blocks`
 */
export function resolveBlockSourceLines(
  blocks: SourceMappedBlock[],
  mainFile?: string,
): number[] {
  let runningLine = 0
  return blocks.map((block) => {
    if (isFromMainDocument(block, mainFile)) {
      runningLine = Math.max(runningLine, block.lineNumber)
    }
    // Included blocks (and main-document blocks reported out of order) keep the
    // last main-document line, so the whole included region maps back to the
    // `include::` directive's neighbourhood and the sequence never decreases.
    return runningLine
  })
}

/**
 * Whether a block positively belongs to the main document (as opposed to an
 * included file). When the main file is unknown (an unsaved document) includes
 * cannot be detected, so every block is considered part of the document.
 * Otherwise a block belongs to the main document only when its recorded file
 * matches: a block with no file (e.g. a table cell) is treated as included so
 * its include-relative line number never pollutes the mapping.
 */
export function isFromMainDocument(
  block: SourceMappedBlock,
  mainFile?: string,
): boolean {
  return !mainFile || block.file === mainFile
}
