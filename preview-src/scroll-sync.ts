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
        document.querySelectorAll(
          'div[class^="data-line-"], div[class*=" data-line-"]',
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
export function getElementsForSourceLine(targetLine: number): {
  previous: CodeLineElement
  next?: CodeLineElement
} {
  const lineNumber = Math.floor(targetLine + 1) // off by one line
  const lines = getCodeLineElements()
  let previous = lines[0] || null
  for (const entry of lines) {
    if (entry.line === lineNumber) {
      return { previous: entry, next: undefined }
    } else if (entry.line > lineNumber) {
      return { previous, next: entry }
    }
    previous = entry
  }
  return { previous }
}

/**
 * Compute the page scroll offset that brings a given source line to the top of
 * the preview, or `undefined` when no mapping is available.
 */
function getScrollTopForSourceLine(line: number): number | undefined {
  const { previous, next } = getElementsForSourceLine(line)
  if (!previous) {
    return undefined
  }
  const previousTop = previous.element.getBoundingClientRect().top
  if (next && next.line !== previous.line) {
    // Between two elements. Go to percentage offset between them.
    const betweenProgress = (line - previous.line) / (next.line - previous.line)
    const elementOffset = next.element.getBoundingClientRect().top - previousTop
    return window.scrollY + previousTop + betweenProgress * elementOffset
  } else if (line === 0) {
    return 0
  }
  return window.scrollY + previousTop
}

/**
 * Attempt to reveal the element for a source line in the editor.
 */
export function scrollToRevealSourceLine(line: number) {
  if (!getSettings().scrollPreviewWithEditor) {
    return
  }
  const scrollTo = getScrollTopForSourceLine(line)
  if (scrollTo !== undefined) {
    // This is the editor → preview direction; do not let the resulting scroll
    // bounce back to the editor.
    suppressScrollEcho(250)
    window.scroll(0, Math.max(1, scrollTo))
  }
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
  const scrollTo = getScrollTopForSourceLine(line)
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
  const lines = getCodeLineElements()
  if (!lines.length) {
    return null
  }

  // `offset` is the page scrollY, so the top of the viewport is at client y = 0.
  const viewportTop = offset - window.scrollY

  // Binary search for `previous`: the last anchor at or above the viewport top.
  let lo = 0
  let hi = lines.length - 1
  if (lines[0].element.getBoundingClientRect().top > viewportTop) {
    // The viewport top is above the first anchor.
    return clampLine(lines[0].line)
  }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (lines[mid].element.getBoundingClientRect().top <= viewportTop) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  const previous = lines[lo]
  const next = lines[lo + 1]
  const previousTop = previous.element.getBoundingClientRect().top
  if (next) {
    const nextTop = next.element.getBoundingClientRect().top
    const span = nextTop - previousTop
    const progress = span > 0 ? (viewportTop - previousTop) / span : 0
    const line = previous.line + progress * (next.line - previous.line)
    return clampLine(line)
  }
  return clampLine(previous.line)
}
