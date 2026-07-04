import { AbstractBlock, Document } from '@asciidoctor/core'

/**
 * Find the source block at, or immediately before, `lineNumber`.
 *
 * Kept free of any VS Code dependency so it can be unit-tested outside the
 * extension host; callers pass `onError` to route unexpected failures to their
 * logger.
 *
 * @param onError invoked with any error thrown while inspecting a single block,
 *   so one problematic node cannot break the whole lookup (and with it the
 *   completion/hover request that relies on it).
 */
export function findNearestBlock(
  document: Document,
  lineNumber: number,
  onError?: (err: unknown) => void,
) {
  let nearestBlock: AbstractBlock | undefined
  const blocks = document.findBy({}, (block: AbstractBlock) => {
    try {
      if (block.getNodeName() === 'document') {
        return false
      }
      const sourceLocation = block.getSourceLocation()
      // Not every node with a source location exposes `getLineNumber`: a
      // `table_cell`, for instance, returns a cursor-like object without it, so
      // calling it would throw and reject the whole completion/hover request —
      // making attribute completion and the attribute hover silently fail for
      // any document that contains a table. Guard the call and skip such nodes.
      if (
        sourceLocation &&
        typeof sourceLocation.getLineNumber === 'function'
      ) {
        const blockLineNumber = sourceLocation.getLineNumber()
        if (blockLineNumber === lineNumber) {
          return true
        } else if (blockLineNumber < lineNumber) {
          nearestBlock = block
        }
      }
    } catch (err) {
      // A single unexpected node must never break the whole lookup — and with
      // it the completion/hover request. Report it and keep scanning.
      onError?.(err)
    }
    return false
  })
  if (blocks && blocks.length) {
    return blocks[0]
  }
  return nearestBlock
}
