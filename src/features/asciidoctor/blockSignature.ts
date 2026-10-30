/**
 * Build a stable signature string for a block, used to detect whether its
 * content changed between two renders. Most blocks expose their raw source;
 * tables do not, so their signature is derived from their cells (otherwise a
 * table containing math would never be skipped and would re-typeset on every
 * keystroke, including edits elsewhere). Returns `undefined` when no usable
 * signature is available (the block is then always re-rendered, which is safe).
 */
function blockSignature(block: any): string | undefined {
  let source: string
  try {
    source = typeof block.getSource === 'function' ? block.getSource() : ''
  } catch {
    return undefined
  }
  if (source) {
    return source
  }

  // A diagram modeled as an image block (see mermaid.ts) has no
  // source of its own: it lives in the data URI of its `target`. Without a
  // signature, a rendered diagram would be morphed back to its placeholder and
  // rendered again on every edit, including edits elsewhere in the document.
  if (
    typeof block.getContext === 'function' &&
    block.getContext() === 'image'
  ) {
    const target = block.getAttribute('target')
    if (typeof target === 'string' && target.startsWith('data:')) {
      return JSON.stringify([
        target,
        block.title,
        block.getCaption(),
        block.getAttribute('link'),
        block.getAttribute('width'),
        block.getAttribute('height'),
      ])
    }
  }

  if (
    typeof block.getNodeName === 'function' &&
    block.getNodeName() === 'table'
  ) {
    try {
      const rows = block.rows
      if (!rows) {
        return undefined
      }
      const parts: string[] = []
      for (const section of [rows.head, rows.body, rows.foot]) {
        if (!section) {
          continue
        }
        for (const row of section) {
          for (const cell of row) {
            parts.push(
              typeof cell.getText === 'function' ? cell.getText() : cell.text,
            )
          }
        }
      }
      return parts.length ? parts.join('') : undefined
    } catch {
      return undefined
    }
  }

  return undefined
}

/**
 * Compute a short, stable hash of a block's signature.
 *
 * Used to tag rendered blocks so the preview can morph incrementally and skip
 * blocks whose content did not change between two renders.
 */
export function hashBlockSource(block: any): string | undefined {
  const signature = blockSignature(block)
  if (!signature) {
    return undefined
  }
  // djb2
  let hash = 5381
  for (let i = 0; i < signature.length; i++) {
    hash = (hash * 33) ^ signature.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}
