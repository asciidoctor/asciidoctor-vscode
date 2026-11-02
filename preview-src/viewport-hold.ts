import {
  MERMAID_ERROR_ATTRIBUTE,
  MERMAID_SOURCE_DATA_URI_PREFIX,
} from '../src/features/preview/mermaid.js'

declare const MathJax: any

/** How long the layout must stay still before the page is considered settled. */
const QUIET_MS = 500
/**
 * Upper bound of a hold, as a resource may never finish loading: MathJax's
 * startup can stay pending forever (#1160), and a slow server can keep an image
 * pending for a long time. Holding for long is harmless since any user input
 * ends the hold right away.
 */
const TIMEOUT_MS = 30000

export interface ViewportHoldEnvironment {
  /** Whether resources or asynchronous renderers can still change the layout. */
  isLoading(): boolean
  /** Subscribe to layout changes. Returns the function that unsubscribes. */
  onLayoutChange(listener: () => void): () => void
  /** Subscribe to the inputs that can scroll the page. Returns the function that unsubscribes. */
  onUserInput(listener: () => void): () => void
}

export interface ViewportHold {
  /** Change what the viewport is held on, e.g. when the editor scrolled. */
  retarget(reposition: () => void): void
}

/**
 * Keep the viewport where `reposition` puts it while a freshly loaded page is
 * still laying out (images, MathJax, Mermaid...), and call `onRelease` once the
 * page has settled, or as soon as the user takes over the scrolling.
 */
export function holdViewport(
  initialReposition: () => void,
  environment: ViewportHoldEnvironment,
  onRelease: (byUser: boolean) => void,
): ViewportHold {
  let reposition = initialReposition
  let released = false
  let quietTimer: ReturnType<typeof setTimeout> | undefined

  const release = (byUser: boolean) => {
    if (released) {
      return
    }
    released = true
    clearTimeout(quietTimer)
    clearTimeout(deadline)
    stopObservingLayout()
    stopObservingInput()
    onRelease(byUser)
  }

  const waitForQuiet = () => {
    clearTimeout(quietTimer)
    quietTimer = setTimeout(() => {
      if (environment.isLoading()) {
        waitForQuiet()
      } else {
        release(false)
      }
    }, QUIET_MS)
  }

  const deadline = setTimeout(() => release(false), TIMEOUT_MS)
  const stopObservingLayout = environment.onLayoutChange(() => {
    reposition()
    waitForQuiet()
  })
  const stopObservingInput = environment.onUserInput(() => release(true))

  reposition()
  waitForQuiet()

  return {
    retarget(next: () => void) {
      if (!released) {
        reposition = next
        reposition()
      }
    },
  }
}

/** Environment of a preview page. Call it once the document is parsed, so that the MathJax script has run. */
export function previewEnvironment(): ViewportHoldEnvironment {
  let mathJaxLoading = false
  const startup =
    typeof MathJax !== 'undefined' ? MathJax.startup?.promise : undefined
  if (startup) {
    mathJaxLoading = true
    const done = () => {
      mathJaxLoading = false
    }
    startup.then(done, done)
  }

  return {
    isLoading: () =>
      document.readyState !== 'complete' ||
      mathJaxLoading ||
      // Mermaid swaps these images for the rendered diagrams, except the ones it
      // failed to render, which would otherwise hold the page until the timeout.
      Array.from(
        document.querySelectorAll(
          `img[src^="${MERMAID_SOURCE_DATA_URI_PREFIX}"]`,
        ),
      ).some((image) => !image.hasAttribute(MERMAID_ERROR_ATTRIBUTE)),
    onLayoutChange(listener) {
      // Resize observers run after the layout and before the paint, so the page
      // is repositioned before the shift can be seen.
      const observer = new ResizeObserver(listener)
      observer.observe(document.getElementById('preview-root') ?? document.body)
      return () => observer.disconnect()
    },
    onUserInput(listener) {
      const events = ['wheel', 'touchstart', 'keydown', 'mousedown']
      const options = { capture: true, passive: true }
      for (const event of events) {
        window.addEventListener(event, listener, options)
      }
      return () => {
        for (const event of events) {
          window.removeEventListener(event, listener, options)
        }
      }
    },
  }
}
