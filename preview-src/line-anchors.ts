const ANCHOR_SELECTOR = '[class^="data-line-"], [class*=" data-line-"]'
const LINE_CLASS = /(^|\s)(data-line-\d+)(?=\s|$)/

function copyLineClass(fromEl: Element, toEl: Element) {
  const line = toEl.getAttribute('class')?.match(LINE_CLASS)?.[2]
  const current = fromEl.getAttribute('class')
  if (line && current && LINE_CLASS.test(current)) {
    fromEl.setAttribute('class', current.replace(LINE_CLASS, `$1${line}`))
  }
}

/**
 * Move the source line anchors of an element kept as is because its content did
 * not change, to where the new render puts them: a line added above a block shifts
 * it without changing its hash, and stale anchors would break the scroll sync.
 */
export function syncLineAnchors(fromEl: Element, toEl: Element) {
  copyLineClass(fromEl, toEl)
  // The anchors nested in the block, such as the cells of a table. An async
  // renderer may have changed the rest of the content, but not these.
  const fromAnchors = fromEl.querySelectorAll(ANCHOR_SELECTOR)
  const toAnchors = toEl.querySelectorAll(ANCHOR_SELECTOR)
  if (fromAnchors.length === toAnchors.length) {
    fromAnchors.forEach((anchor, index) => {
      copyLineClass(anchor, toAnchors[index])
    })
  }
}
