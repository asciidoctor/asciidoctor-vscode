/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker'
import { onceDocumentLoaded } from './events'
import { createPosterForVsCode } from './messaging'
import { getEditorLineNumberForPageOffset, scrollToRevealSourceLine } from './scroll-sync'
import { getData, getSettings } from './settings'
import throttle = require('lodash.throttle');

declare let acquireVsCodeApi: any

let scrollDisabled = true
const marker = new ActiveLineMarker()
const settings = getSettings()

const vscode = acquireVsCodeApi()

const originalState = vscode.getState()

const state = {
  line: settings.line, // shadow settings.line with vscode.getState().line if the latter exists
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
    window.addEventListener('scroll', throttle(
      () => {
        vscode.setState({ ...vscode.getState(), scrollX: window.scrollX, scrollY: window.scrollY })
      },
      250,
      { leading: true, trailing: true })
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
    const scrollOptions = { top: scrollY, left: scrollX, behavior: 'auto' as ScrollBehavior }
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
  const imageInfo: { id: string, height: number, width: number }[] = []
  const images = document.getElementsByTagName('img')
  if (images) {
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

window.addEventListener('resize', () => {
  scrollDisabled = true
  updateImageSizes()
}, true)

window.addEventListener('message', (event) => {
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
  }
}, false)

document.addEventListener('dblclick', (event) => {
  if (!settings.doubleClickToSwitchToEditor) {
    return
  }

  // Ignore clicks on links
  for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
    if (node.tagName === 'A') {
      return
    }
  }

  const offset = event.pageY
  const line = getEditorLineNumberForPageOffset(offset)
  if (typeof line === 'number' && !isNaN(line)) {
    messaging.postMessage('didClick', { line: Math.floor(line) })
  }
})

const passThroughLinkSchemes = ['http:', 'https:', 'mailto:', 'vscode:', 'vscode-insiders:']

document.addEventListener('click', (event) => {
  if (!event) {
    return
  }

  let node: any = event.target
  while (node) {
    if (node.tagName && node.tagName === 'A' && node.href) {
      if (node.getAttribute('href').startsWith('#')) {
        return
      }
      let hrefText = node.getAttribute('data-href')
      if (!hrefText) {
        // Pass through known schemes
        if (passThroughLinkSchemes.some((scheme) => node.href.startsWith(scheme))) {
          return
        }
        hrefText = node.getAttribute('href')
      }

      // If original link doesn't look like a url, delegate back to VS Code to resolve
      if (!/^[a-z-]+:\/\//i.test(hrefText) || hrefText.startsWith('file:///')) {
        messaging.postMessage('clickLink', { href: hrefText })
        event.preventDefault()
        event.stopPropagation()
        return
      }
      return
    }
    node = node.parentNode
  }
}, true)

window.addEventListener('scroll', throttle(() => {
  const line = getEditorLineNumberForPageOffset(window.scrollY)
  vscode.setState({ ...vscode.getState(), line })

  if (settings.scrollEditorWithPreview) {
    if (scrollDisabled) {
      scrollDisabled = false
    } else {
      if (window.scrollY === 0) {
        // scroll to top, document title does not have a data-line attribute
        messaging.postMessage('revealLine', { line: 0 })
      } else if (typeof line === 'number' && !isNaN(line)) {
        messaging.postMessage('revealLine', { line })
      }
    }
  }
}, 50))
