/**
 * Pure line ↔ pixel-offset mapping for the preview's scroll sync.
 *
 * This is the DOM-free core of `preview-src/scroll-sync.ts`: the webview reads
 * the `data-line-N` anchors and their on-screen positions, then delegates the
 * arithmetic here. Keeping it pure (numbers in, numbers out) lets it be unit
 * tested without a browser and, more importantly, documents the one convention
 * that has repeatedly caused subtle scroll jumps:
 *
 *   - VS Code editor lines are **0-based** (line 0 = first line).
 *   - The preview anchors are **1-based** source lines (`data-line-N`, the
 *     Asciidoctor source line number).
 *
 * So an editor line `L` maps to the anchor `data-line-(L+1)`. Functions that
 * receive an *editor* line therefore add 1 before matching an anchor; functions
 * that receive a value already expressed as a *source* line (a `data-line-N`
 * value, e.g. the output of {@link sourceLineAtViewportTop}) must NOT add 1 —
 * doing so shifts the lookup by one anchor and makes a "keep position" re-anchor
 * jump by roughly one source line.
 */

/** An anchor: its 1-based source line and its client-Y (its `getBoundingClientRect().top`). */
export interface LineTop {
  readonly line: number
  readonly top: number
}

/**
 * Indices, into the (line-ascending) `lines` array, of the anchors bracketing
 * `targetLine`.
 *
 * `previous` is the last anchor at or before the target (defaults to 0 so a
 * target below the first anchor still resolves). `next` is the following anchor
 * when the target falls strictly between two anchors, or -1 on an exact match or
 * when the target is at/after the last anchor.
 *
 * @param sourceLine `false` (default): `targetLine` is a 0-based editor line, so
 *   +1 converts it to the 1-based source line the anchors use. `true`:
 *   `targetLine` is already a 1-based source line and is matched as-is.
 */
export function anchorIndicesForLine(
  lines: readonly number[],
  targetLine: number,
  sourceLine = false,
): { previous: number; next: number } {
  const lineNumber = sourceLine
    ? Math.floor(targetLine)
    : Math.floor(targetLine + 1)
  let previous = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === lineNumber) {
      return { previous: i, next: -1 }
    }
    if (lines[i] > lineNumber) {
      return { previous, next: i }
    }
    previous = i
  }
  return { previous, next: -1 }
}

/**
 * Page scroll offset that brings `line` to the top of the preview, or
 * `undefined` when there is no anchor to map to.
 *
 * @param sourceLine see {@link anchorIndicesForLine}.
 */
export function scrollTopForLine(
  anchors: readonly LineTop[],
  scrollY: number,
  line: number,
  sourceLine = false,
): number | undefined {
  if (!anchors.length) {
    return undefined
  }
  const { previous, next } = anchorIndicesForLine(
    anchors.map((a) => a.line),
    line,
    sourceLine,
  )
  const previousAnchor = anchors[previous]
  if (!previousAnchor) {
    return undefined
  }
  const previousTop = previousAnchor.top
  const nextAnchor = next >= 0 ? anchors[next] : undefined
  if (nextAnchor && nextAnchor.line !== previousAnchor.line) {
    // Between two anchors: interpolate the pixel offset by the target's progress
    // through the source lines that separate them.
    const betweenProgress =
      (line - previousAnchor.line) / (nextAnchor.line - previousAnchor.line)
    const elementOffset = nextAnchor.top - previousTop
    return scrollY + previousTop + betweenProgress * elementOffset
  } else if (line === 0) {
    return 0
  }
  return scrollY + previousTop
}

/**
 * Fractional 1-based source line sitting at `viewportTop` (a client-Y), or
 * `null` when there are no anchors. The result is unclamped; callers clamp it to
 * the document's line range.
 *
 * The viewport top is interpolated linearly between the two consecutive anchors
 * that surround it, so the mapping advances gradually as the preview scrolls
 * instead of snapping from one anchor's line to the next when a tall block sits
 * between them.
 */
export function sourceLineAtViewportTop(
  anchors: readonly LineTop[],
  viewportTop: number,
): number | null {
  if (!anchors.length) {
    return null
  }
  if (anchors[0].top > viewportTop) {
    // The viewport top is above the first anchor.
    return anchors[0].line
  }
  // Binary search for the last anchor at or above the viewport top.
  let lo = 0
  let hi = anchors.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (anchors[mid].top <= viewportTop) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  const previous = anchors[lo]
  const next = anchors[lo + 1]
  if (next) {
    const span = next.top - previous.top
    const progress = span > 0 ? (viewportTop - previous.top) / span : 0
    return previous.line + progress * (next.line - previous.line)
  }
  return previous.line
}
