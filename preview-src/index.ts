import { ActiveLineMarker } from './activeLineMarker.js'
import { updatePreviewContent } from './content-update.js'
import { onceDocumentLoaded } from './events.js'
import { createPosterForVsCode } from './messaging.js'
import {
  getEditorLineNumberForPageOffset,
  getLastSourceLine,
  getSourceLineForElement,
  isProgrammaticScroll,
  scrollToRevealSourceLine,
  suppressScrollEcho,
} from './scroll-sync.js'
import { getData, getSettings } from './settings.js'

import throttle = require('lodash.throttle')

declare let acquireVsCodeApi: any

let scrollDisabled = true
const marker = new ActiveLineMarker()
const settings = getSettings()

const vscode = acquireVsCodeApi()

const originalState = vscode.getState()

const state = {
  ...settings,
  ...(typeof originalState === 'object' ? originalState : {}),
  ...getData<any>('data-state'),
}

// Make sure to sync VS Code state here
vscode.setState(state)

const messaging = createPosterForVsCode(vscode)

window.cspAlerter.setPoster(messaging)
window.styleLoadingMonitor.setPoster(messaging)

window.onload = () => {
  updateImageSizes()
}

onceDocumentLoaded(() => {
  const windowNeedsRestoration = !settings.preservePreviewWhenHidden

  if (windowNeedsRestoration) {
    window.addEventListener(
      'scroll',
      throttle(
        () => {
          vscode.setState({
            ...vscode.getState(),
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          })
        },
        250,
        { leading: true, trailing: true },
      ),
    )
  }

  if (settings.scrollPreviewWithEditor) {
    setTimeout(() => {
      const initialLine = vscode.getState().line
      if (!isNaN(initialLine)) {
        scrollDisabled = true
        scrollToRevealSourceLine(initialLine)
      }
    }, 0)
  } else if (windowNeedsRestoration) {
    const { scrollX, scrollY } = vscode.getState()
    const scrollOptions = {
      top: scrollY,
      left: scrollX,
      behavior: 'auto' as ScrollBehavior,
    }
    window.scrollTo(scrollOptions)
  }
})

const onUpdateView = (() => {
  const doScroll = throttle((line: number) => {
    scrollDisabled = true
    scrollToRevealSourceLine(line)
  }, 50)

  return (line: number) => {
    if (!isNaN(line)) {
      vscode.setState({ ...vscode.getState(), line })
      doScroll(line)
    }
  }
})()

const updateImageSizes = throttle(() => {
  const imageInfo: { id: string; height: number; width: number }[] = []
  const images = document.getElementsByTagName('img')
  if (images && images.length > 0) {
    let i
    for (i = 0; i < images.length; i++) {
      const img = images[i]

      if (img.classList.contains('loading')) {
        img.classList.remove('loading')
      }

      imageInfo.push({
        id: img.id,
        height: img.height,
        width: img.width,
      })
    }

    messaging.postMessage('cacheImageSizes', imageInfo)
  }
}, 50)

window.addEventListener(
  'resize',
  () => {
    scrollDisabled = true
    updateImageSizes()
  },
  true,
)

window.addEventListener(
  'message',
  (event) => {
    if (event.data.source !== settings.source) {
      return
    }

    switch (event.data.type) {
      case 'onDidChangeTextEditorSelection': {
        const line = event.data.line
        marker.onDidChangeTextEditorSelection(line)
        vscode.setState({ ...vscode.getState(), line })
        break
      }

      case 'updateView':
        onUpdateView(event.data.line)
        break

      case 'updateContent': {
        // Morph the new content in place instead of reloading the webview.
        const applied = updatePreviewContent(event.data.html)
        if (applied) {
          updateImageSizes()
        }
        break
      }
    }
  },
  false,
)

const passThroughLinkSchemes = [
  'http:',
  'https:',
  'mailto:',
  'vscode:',
  'vscode-insiders:',
]

document.addEventListener(
  'click',
  (event) => {
    if (!event) {
      return
    }

    let node: any = event.target
    while (node) {
      if (node.tagName && node.tagName === 'A' && node.href) {
        const href = node.getAttribute('href')
        if (href.startsWith('#')) {
          // In-page anchor (e.g. a table-of-contents entry): let the browser
          // scroll the preview to the target, but also move the editor there.
          // The browser's instant jump can be swallowed by the scroll guard, so
          // reveal the target line explicitly and suppress the echo from the
          // browser-driven scroll that follows.
          const target = document.getElementById(
            decodeURIComponent(href.slice(1)),
          )
          const targetLine = getSourceLineForElement(target)
          if (
            typeof targetLine === 'number' &&
            settings.scrollEditorWithPreview
          ) {
            suppressScrollEcho(250)
            messaging.postMessage('revealLine', {
              line: Math.max(0, targetLine - 1),
            })
          }
          return
        }
        let hrefText = node.getAttribute('data-href')
        if (!hrefText) {
          // Pass through known schemes
          if (
            passThroughLinkSchemes.some((scheme) =>
              node.href.startsWith(scheme),
            )
          ) {
            return
          }
          hrefText = node.getAttribute('href')
        }

        // If original link doesn't look like a url, delegate back to VS Code to resolve
        if (
          !/^[a-z-]+:\/\//i.test(hrefText) ||
          hrefText.startsWith('file:///')
        ) {
          messaging.postMessage('clickLink', { href: hrefText })
          event.preventDefault()
          event.stopPropagation()
          return
        }
        return
      }
      node = node.parentNode
    }
  },
  true,
)

window.addEventListener(
  'scroll',
  throttle(() => {
    // Ignore scrolls we triggered ourselves while re-anchoring after a content
    // update, so they do not bounce back to the editor.
    if (isProgrammaticScroll()) {
      return
    }
    const line = getEditorLineNumberForPageOffset(window.scrollY)
    vscode.setState({ ...vscode.getState(), line })

    if (settings.scrollEditorWithPreview) {
      if (scrollDisabled) {
        scrollDisabled = false
      } else {
        // Top/bottom alignment can never bring the first/last source line to the
        // top of the viewport, so map the extremes explicitly: at the very top
        // go to line 0 (the title has no data-line anchor), and at the very
        // bottom go to the last line so the editor scrolls all the way down.
        const atBottom =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 4
        if (window.scrollY === 0) {
          messaging.postMessage('revealLine', { line: 0 })
        } else if (atBottom) {
          // The sentinel is anchored one past the last line, so step back one
          // to a line the editor can actually reveal. Flag it as `atBottom` so
          // the editor just brings the last line into view (minimal scroll)
          // instead of pinning it to the top of the viewport.
          messaging.postMessage('revealLine', {
            line: Math.max(0, getLastSourceLine() - 1),
            atBottom: true,
          })
        } else if (typeof line === 'number' && !isNaN(line)) {
          messaging.postMessage('revealLine', { line })
        }
      }
    }
  }, 50),
)
