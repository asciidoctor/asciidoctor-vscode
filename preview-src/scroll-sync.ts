import {
  anchorIndicesForLine,
  type LineTop,
  scrollTopForLine,
  sourceLineAtViewportTop,
} from '../src/features/preview/scrollMapping.js'
import { getSettings } from './settings.js'

function clamp(min: number, max: number, value: number) {
  return Math.min(max, Math.max(min, value))
}

function clampLine(line: number) {
  return clamp(0, getSettings().lineCount - 1, line)
}

export interface CodeLineElement {
  element: HTMLElement
  line: number
}

// Suppression of the editor → preview → editor feedback loop. While we are
// re-anchoring the preview after a content update — or while an asynchronous
// renderer (notably MathJax) is still reflowing the page — the resulting
// 'scroll' events must not be echoed back to the editor.
//
// Two cooperating mechanisms:
//   - `scrollEchoSuppressedUntil`: a deadline covering discrete programmatic
//     scrolls and the synchronous part of an update.
//   - `pendingAsyncRenders`: a counter held for the whole duration of an async
//     render (e.g. MathJax typesetting), since it can reflow the page seconds
//     after the update, well past any fixed time window.
let scrollEchoSuppressedUntil = 0
let pendingAsyncRenders = 0

export function isProgrammaticScroll(): boolean {
  return pendingAsyncRenders > 0 || Date.now() < scrollEchoSuppressedUntil
}

export function suppressScrollEcho(durationMs: number) {
  scrollEchoSuppressedUntil = Math.max(
    scrollEchoSuppressedUntil,
    Date.now() + durationMs,
  )
}

export function beginAsyncRender() {
  pendingAsyncRenders++
}

export function endAsyncRender() {
  pendingAsyncRenders = Math.max(0, pendingAsyncRenders - 1)
  // Keep suppressing briefly after the layout settles so the trailing scroll
  // event from the final reflow is still ignored.
  suppressScrollEcho(250)
}

let cachedCodeLineElements: CodeLineElement[] | undefined

function getCodeLineElements(): CodeLineElement[] {
  if (!cachedCodeLineElements) {
    cachedCodeLineElements = Array.prototype.map
      .call(
        // Match any element carrying a `data-line-*` anchor, not only `div`: a
        // table renders as `<table>` and its cells as `<td>`, so a `div`-only
        // selector drops every table anchor. When a table is the first block
        // (no paragraph before it), the only `div` anchor left is the trailing
        // end-of-document sentinel, which collapses every scroll position onto
        // the last line. See the matching selector in content-update.ts.
        document.querySelectorAll(
          '[class^="data-line-"], [class*=" data-line-"]',
        ),
        (element: any) => {
          // A block now carries several `data-*` roles (`data-line-N` and the
          // incremental-update `data-h-<hash>`), so match the line class
          // explicitly instead of assuming it is the last class.
          const lineClass = element.className
            .split(' ')
            .find((c: string) => /^data-line-\d+$/.test(c))
          const line = lineClass
            ? parseInt(lineClass.slice('data-line-'.length))
            : NaN
          return { element, line }
        },
      )
      .filter((x: any) => !isNaN(x.line)) as CodeLineElement[]
  }
  return cachedCodeLineElements
}

/**
 * Invalidate the memoized list of source-line elements.
 *
 * Must be called whenever the preview content changes (e.g. after an
 * incremental morph) so the scroll mapping reflects the new DOM.
 */
export function resetCodeLineElements() {
  cachedCodeLineElements = undefined
}

/**
 * Snapshot the anchors as `{ line, top }` for the pure mapping helpers, reading
 * each element's current on-screen position once.
 */
function codeAnchors(): LineTop[] {
  return getCodeLineElements().map((entry) => ({
    line: entry.line,
    top: entry.element.getBoundingClientRect().top,
  }))
}

/**
 * Source line of the nearest `data-line-*` anchor at or above `element`, or
 * `undefined` when none is found. Used to map a click target (e.g. a TOC entry)
 * back to its editor line.
 */
export function getSourceLineForElement(
  element: Element | null,
): number | undefined {
  let el: Element | null = element
  while (el) {
    const lineClass = (el.getAttribute('class') || '')
      .split(' ')
      .find((c) => /^data-line-\d+$/.test(c))
    if (lineClass) {
      return parseInt(lineClass.slice('data-line-'.length))
    }
    el = el.parentElement
  }
  return undefined
}

/**
 * Highest source line that has a mapped element (the end-of-document sentinel).
 *
 * Read from the DOM rather than the injected settings so it stays correct after
 * incremental updates, which change the line count without reloading the head.
 */
export function getLastSourceLine(): number {
  const lines = getCodeLineElements()
  return lines.length ? lines[lines.length - 1].line : 0
}

/**
 * Find the html elements that map to a specific target line in the editor.
 *
 * If an exact match, returns a single element. If the line is between elements,
 * returns the element prior to and the element after the given line.
 */
export function getElementsForSourceLine(
  targetLine: number,
  sourceLine = false,
): {
  previous: CodeLineElement
  next?: CodeLineElement
} {
  const lines = getCodeLineElements()
  const { previous, next } = anchorIndicesForLine(
    lines.map((entry) => entry.line),
    targetLine,
    sourceLine,
  )
  return {
    previous: lines[previous],
    next: next >= 0 ? lines[next] : undefined,
  }
}

/**
 * Attempt to reveal the element for a source line in the editor.
 */
export function scrollToRevealSourceLine(line: number) {
  if (!getSettings().scrollPreviewWithEditor) {
    return
  }
  // `line` is a 0-based editor line (from `updateView`/the initial state).
  const scrollTo = scrollTopForLine(codeAnchors(), window.scrollY, line)
  if (scrollTo === undefined) {
    return
  }
  // `scrollTo` brings `line` to the very top of the preview, so its distance
  // from the current scroll position is where that line sits on screen right
  // now (its client-Y).
  const clientY = scrollTo - window.scrollY
  const viewportHeight = window.innerHeight
  // Don't move when the line is already comfortably on screen: a refocus, an
  // edit, or a selection that doesn't really scroll the editor must not make
  // the preview jump when the target line is already visible.
  //
  // Exception — a "snap zone" near the top: during smooth editor → preview
  // scrolling the editor's top line sits at client-Y ≈ 0 and must keep snapping
  // to the preview top, or lockstep scrolling would stall (#638). Only lines
  // *below* that zone (and still on screen) are left in place.
  const snapZone = viewportHeight / 4
  if (clientY > snapZone && clientY < viewportHeight) {
    return
  }
  // This is the editor → preview direction; do not let the resulting scroll
  // bounce back to the editor.
  suppressScrollEcho(250)
  window.scroll(0, Math.max(1, scrollTo))
}

/**
 * Re-pin the preview to a source line regardless of the
 * `scrollPreviewWithEditor` setting.
 *
 * Used to keep the viewport stable across incremental content updates and
 * asynchronous layout shifts (MathJax, images, diagrams), so editing does not
 * make the preview jump.
 */
export function scrollToLine(line: number) {
  // `line` comes from `getEditorLineNumberForPageOffset`, i.e. it is already a
  // 1-based source line (a `data-line-N` value), so map it back with the same
  // convention (`sourceLine: true`) — otherwise the +1 for editor lines targets
  // the next anchor and this "keep position" re-pin jumps by one source line.
  const scrollTo = scrollTopForLine(codeAnchors(), window.scrollY, line, true)
  if (scrollTo !== undefined) {
    suppressScrollEcho(250)
    window.scroll(0, Math.max(0, scrollTo))
  }
}

/**
 * Map a preview pixel offset to a fractional editor source line.
 *
 * The viewport top is interpolated linearly between the two consecutive source
 * anchors that surround it: its progress through the *preview pixels* from one
 * anchor to the next maps onto the *source lines* between them. This makes the
 * editor advance gradually as the preview scrolls, instead of holding on an
 * anchor's line and then snapping to the next anchor (e.g. 42 → 62) when a tall
 * block or a run of non-rendering source lines sits between two anchors.
 */
export function getEditorLineNumberForPageOffset(offset: number) {
  // `offset` is the page scrollY, so the top of the viewport is at client y = 0.
  const viewportTop = offset - window.scrollY
  const line = sourceLineAtViewportTop(codeAnchors(), viewportTop)
  return line === null ? null : clampLine(line)
}
