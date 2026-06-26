import morphdom from 'morphdom'
import {
  beginAsyncRender,
  endAsyncRender,
  getEditorLineNumberForPageOffset,
  resetCodeLineElements,
  scrollToLine,
  suppressScrollEcho,
} from './scroll-sync.js'
import { getSettings } from './settings.js'

declare const MathJax: any

// Match any element carrying a `data-line-*` anchor, not only `div`: tables
// render as `<table>` and must be recognized as leaf blocks so their math is
// reprocessed (otherwise editing a table cell leaves every equation as raw text).
const BLOCK_SELECTOR = '[class^="data-line-"], [class*=" data-line-"]'

/**
 * Diagnostic logging for the incremental update, off by default. Enable it with
 * `"asciidoc.debug.trace": "verbose"` and reload the preview, then read the
 * messages in the webview console (command "Developer: Open Webview Developer
 * Tools"). Useful to troubleshoot reports of slow or missing preview updates.
 */
function debugLog(...args: unknown[]) {
  if (getSettings().debug) {
    console.log('[asciidoc.preview]', ...args)
  }
}

// Counts updateContent invocations (helps spot duplicate updates per edit).
let updateSeq = 0

// Coalesced MathJax typeset queue. Successive edits add their changed blocks
// here; a single drain typesets the set and clears it. Because morphdom reuses
// the same DOM element across updates, editing one equation repeatedly
// (e.g. typing "12345") dedupes to a single typeset of that element instead of
// piling up one per keystroke.
const pendingMathBlocks = new Set<Element>()
let mathDrainScheduled = false

/**
 * Return the `data-h-*` content-hash class of a block, if any.
 */
function blockHash(el: Element): string | undefined {
  return (el.getAttribute('class') || '')
    .split(' ')
    .find((c) => c.indexOf('data-h-') === 0)
}

/**
 * Structural containers carry a `data-line` anchor (the document node's roles
 * even land on `<body>`) but wrap arbitrary content, including math. They must
 * never be a reprocessing unit: re-typesetting a whole container re-renders
 * every equation it contains. Reprocessing must target the leaf content blocks
 * (paragraphs, stem blocks, tables, listings…) instead.
 */
function isContainerWrapper(el: Element): boolean {
  return (
    el.tagName === 'BODY' ||
    el.id === 'preview-root' ||
    el.id === 'content' ||
    el.id === 'preamble' ||
    /(^|\s)sect\d(\s|$)/.test(el.className)
  )
}

/**
 * Walk up from a node to the nearest enclosing *leaf* source block (a
 * `data-line-*` element that is not a section container).
 */
function nearestBlock(node: Node | null): Element | null {
  let el: Element | null =
    node && node.nodeType === 1
      ? (node as Element)
      : (node && node.parentElement) || null
  while (el) {
    if (el.matches && el.matches(BLOCK_SELECTOR) && !isContainerWrapper(el)) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/**
 * Collect the leaf source blocks contained in (or equal to) an added node, so a
 * newly inserted section's math is reprocessed without re-typesetting existing
 * sections.
 */
function collectLeafBlocks(node: Node, into: Set<Element>) {
  if (node.nodeType !== 1) {
    return
  }
  const el = node as Element
  if (el.matches(BLOCK_SELECTOR) && !isContainerWrapper(el)) {
    into.add(el)
  }
  el.querySelectorAll(BLOCK_SELECTOR).forEach((leaf) => {
    if (!isContainerWrapper(leaf)) {
      into.add(leaf)
    }
  })
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

  if (
    typeof MathJax !== 'undefined' &&
    typeof MathJax.typesetPromise === 'function'
  ) {
    for (const block of blocks) {
      pendingMathBlocks.add(block)
    }
    scheduleMathDrain(anchorLine)
  }
}

/**
 * Typeset all blocks queued in `pendingMathBlocks` in a single drain, then clear
 * them. MathJax typesets asynchronously and reflows the page once done, so the
 * scroll-echo suppression is held for the whole drain and the preview is re-
 * pinned at the end. If more blocks accumulate while draining, a follow-up drain
 * is scheduled.
 */
function scheduleMathDrain(anchorLine: number | undefined) {
  if (mathDrainScheduled) {
    return
  }
  mathDrainScheduled = true
  beginAsyncRender()
  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true
    endAsyncRender()
  }

  const tQueue = performance.now()
  const batch = Array.from(pendingMathBlocks)
  pendingMathBlocks.clear()

  // morphdom replaced these blocks with freshly rendered HTML carrying raw math
  // delimiters again, so drop the math items MathJax still tracks for them
  // before re-typesetting (otherwise it skips the already-known nodes).
  if (typeof MathJax.typesetClear === 'function') {
    MathJax.typesetClear(batch)
  }

  MathJax.typesetPromise(batch)
    .then(() => {
      debugLog(
        `MathJax typeset ${(performance.now() - tQueue).toFixed(0)}ms for ${batch.length} block(s)`,
      )
      resetCodeLineElements()
      if (typeof anchorLine === 'number' && !isNaN(anchorLine)) {
        scrollToLine(anchorLine)
      }
    })
    .catch((err) => {
      debugLog('MathJax typeset failed', err)
    })
    .finally(() => {
      mathDrainScheduled = false
      release()
      if (pendingMathBlocks.size) {
        scheduleMathDrain(anchorLine)
      }
    })

  // Safety net: never leave the suppression stuck on if MathJax stalls.
  setTimeout(() => {
    if (!released) {
      mathDrainScheduled = false
      release()
    }
  }, 10000)
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
  debugLog(`updateContent #${++updateSeq} received`)
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

  const tMorph = performance.now()

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
      collectLeafBlocks(node, changedBlocks)
      return node
    },
  })

  resetCodeLineElements()

  const changed = outermost(changedBlocks)
  if (getSettings().debug) {
    debugLog(
      `morph ${(performance.now() - tMorph).toFixed(0)}ms, ${changed.length} changed block(s):`,
      changed.map((b) => {
        const cls = b.getAttribute('class') || ''
        const line = (cls.match(/data-line-(\d+)/) || [])[1] ?? '?'
        const hash = blockHash(b) ?? 'NO-HASH'
        return `${b.tagName.toLowerCase()}#l${line}(${hash})`
      }),
    )
  }

  reprocess(changed, anchorLine)

  // Re-pin straight after the synchronous layout has settled.
  if (typeof anchorLine === 'number' && !isNaN(anchorLine)) {
    scrollToLine(anchorLine)
  }
  return true
}
