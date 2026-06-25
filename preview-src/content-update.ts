import morphdom from 'morphdom'
import {
  beginAsyncRender,
  endAsyncRender,
  getEditorLineNumberForPageOffset,
  resetCodeLineElements,
  scrollToLine,
  suppressScrollEcho,
} from './scroll-sync.js'

declare const MathJax: any

const BLOCK_SELECTOR = 'div[class^="data-line-"], div[class*=" data-line-"]'

/**
 * Return the `data-h-*` content-hash class of a block, if any.
 */
function blockHash(el: Element): string | undefined {
  return (el.getAttribute('class') || '')
    .split(' ')
    .find((c) => c.indexOf('data-h-') === 0)
}

/**
 * Walk up from a node to the nearest enclosing source block (a `data-line-*`
 * element).
 */
function nearestBlock(node: Node | null): Element | null {
  let el: Element | null =
    node && node.nodeType === 1
      ? (node as Element)
      : (node && node.parentElement) || null
  while (el) {
    if (el.matches && el.matches(BLOCK_SELECTOR)) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/**
 * Keep only the outermost elements of a set (drop those nested inside another
 * member), so each changed region is reprocessed exactly once.
 */
function outermost(elements: Set<Element>): Element[] {
  const all = Array.from(elements)
  return all.filter(
    (el) => !all.some((other) => other !== el && other.contains(el)),
  )
}

/**
 * Re-run the asynchronous post-processors (highlight.js, Mermaid, MathJax) on
 * the blocks that were added or changed by the morph, then re-pin the preview
 * to `anchorLine` once MathJax — which lays out asynchronously and shifts
 * heights — has finished.
 */
function reprocess(blocks: Element[], anchorLine: number | undefined) {
  if (blocks.length === 0) {
    return
  }

  const highlight = (window as any).__asciidocHighlight
  if (typeof highlight === 'function') {
    for (const block of blocks) {
      highlight(block)
    }
  }

  const renderMermaid = (window as any).__asciidocRenderMermaid
  if (typeof renderMermaid === 'function') {
    const mermaidNodes: Element[] = []
    for (const block of blocks) {
      if (block.matches('.mermaid')) {
        mermaidNodes.push(block)
      }
      block
        .querySelectorAll('.mermaid')
        .forEach((node) => mermaidNodes.push(node))
    }
    if (mermaidNodes.length) {
      renderMermaid(mermaidNodes)
    }
  }

  // Re-pin once any image in a changed block finishes loading (loading reflows
  // the page after the morph settled).
  if (typeof anchorLine === 'number' && !isNaN(anchorLine)) {
    for (const block of blocks) {
      block.querySelectorAll('img').forEach((img) => {
        if (!img.complete) {
          img.addEventListener('load', () => scrollToLine(anchorLine), {
            once: true,
          })
        }
      })
    }
  }

  if (typeof MathJax !== 'undefined' && MathJax.Hub) {
    // MathJax typesets asynchronously and reflows the page once done — possibly
    // seconds later on a long document. Hold the scroll-echo suppression for the
    // whole render so the reflow does not bounce the editor, and re-pin once it
    // completes.
    beginAsyncRender()
    let ended = false
    const finish = () => {
      if (ended) {
        return
      }
      ended = true
      resetCodeLineElements()
      if (typeof anchorLine === 'number' && !isNaN(anchorLine)) {
        scrollToLine(anchorLine)
      }
      endAsyncRender()
    }
    for (const block of blocks) {
      MathJax.Hub.Queue(['Typeset', MathJax.Hub, block])
    }
    MathJax.Hub.Queue(finish)
    // Safety net: never leave the suppression stuck on if MathJax stalls.
    setTimeout(finish, 10000)
  }
}

/**
 * Apply a freshly rendered document to the preview by morphing `#preview-root`
 * in place instead of reloading the whole webview.
 *
 * Blocks whose source is unchanged (same `data-h-*` hash) are left untouched,
 * preserving their already-rendered MathJax / Mermaid / highlight.js / image
 * output. The scroll position is kept stable across the update.
 *
 * Returns `true` when the morph was applied, `false` when the caller should
 * fall back to a full reload.
 */
export function updatePreviewContent(html: string): boolean {
  const currentRoot = document.getElementById('preview-root')
  if (!currentRoot) {
    return false
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const newRoot = parsed.getElementById('preview-root')
  if (!newRoot) {
    return false
  }

  // Suppress the editor → preview → editor feedback loop for the synchronous
  // part of this update (morph + immediate re-anchor). The MathJax path extends
  // this for the duration of its asynchronous reflow.
  suppressScrollEcho(400)

  // Remember the source line at the top of the viewport so the update does not
  // make the preview jump, even as block heights change.
  const anchorLine =
    getEditorLineNumberForPageOffset(window.scrollY) ?? undefined

  const changedBlocks = new Set<Element>()
  const record = (node: Node | null) => {
    const block = nearestBlock(node)
    if (block) {
      changedBlocks.add(block)
    }
  }

  morphdom(currentRoot, newRoot, {
    onBeforeElUpdated(fromEl: Element, toEl: Element) {
      if (fromEl.isEqualNode(toEl)) {
        return false
      }
      // An unchanged block whose live DOM was mutated by an async renderer
      // (MathJax/Mermaid/highlight) no longer equals the freshly produced
      // source, but its content hash is identical: keep the rendered version.
      const fromHash = blockHash(fromEl)
      const toHash = blockHash(toEl)
      if (fromHash && toHash && fromHash === toHash) {
        return false
      }
      return true
    },
    onElUpdated(el: Element) {
      record(el)
    },
    onNodeAdded(node: Node) {
      record(node)
      return node
    },
  })

  resetCodeLineElements()
  reprocess(outermost(changedBlocks), anchorLine)

  // Re-pin straight after the synchronous layout has settled.
  if (typeof anchorLine === 'number' && !isNaN(anchorLine)) {
    scrollToLine(anchorLine)
  }
  return true
}
