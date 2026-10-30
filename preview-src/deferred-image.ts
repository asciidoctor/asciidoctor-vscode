// The next version of each displayed image, loading or failed to load. Kept after
// a failure so that an edit elsewhere in the document does not request it again.
const nextImages = new WeakMap<HTMLImageElement, HTMLImageElement>()

export interface DeferredImageOptions {
  /** Run a DOM mutation without moving what the viewport shows. */
  keepViewport: (mutate: () => void) => void
  /** Tooltip of an image kept on screen because its next version failed to load. */
  staleTitle: () => string
}

/**
 * Keep displaying an image until the new version of its `src` is ready, then swap
 * it in one go. Morphing `src` in place would leave the page without the image
 * when the new one fails to load, which happens on every syntax error while typing
 * a Kroki diagram: the block collapses to the size of the alt text, the page moves,
 * and it moves back once the diagram is valid again.
 *
 * Returns `true` when the update is taken care of, `false` when the caller should
 * morph the image as usual.
 */
export function deferImageUpdate(
  fromEl: HTMLImageElement,
  toEl: HTMLImageElement,
  options: DeferredImageOptions,
): boolean {
  const src = toEl.getAttribute('src')
  if (
    !src ||
    src === fromEl.getAttribute('src') ||
    // Available at once. It also covers the Mermaid placeholder, which must reach
    // the DOM to be rendered.
    src.startsWith('data:') ||
    // Would not load until it is in the viewport, so it would never be ready.
    toEl.getAttribute('loading') === 'lazy'
  ) {
    nextImages.delete(fromEl)
    return false
  }
  if (nextImages.get(fromEl)?.isEqualNode(toEl)) {
    return true
  }

  const next = document.importNode(toEl, false)
  nextImages.set(fromEl, next)
  const isLatest = () => fromEl.isConnected && nextImages.get(fromEl) === next
  const swap = () => {
    if (isLatest()) {
      nextImages.delete(fromEl)
      options.keepViewport(() => fromEl.replaceWith(next))
    }
  }
  next.decode().then(swap, () => {
    if (fromEl.complete && fromEl.naturalWidth > 0) {
      // Keep the page stable, but do not pass the old version off as up to date.
      if (isLatest()) {
        fromEl.style.opacity = '0.5'
        fromEl.title = options.staleTitle()
      }
    } else {
      // There is nothing better to display: show that the image is broken.
      swap()
    }
  })
  return true
}
