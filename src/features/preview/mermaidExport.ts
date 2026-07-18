import { JSDOM } from 'jsdom'

let mermaidModule: typeof import('mermaid').default | undefined
let initialized = false
let sequence = 0

async function initializeMermaidRenderer(): Promise<
  typeof import('mermaid').default
> {
  if (initialized && mermaidModule) {
    return mermaidModule
  }

  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window as unknown as Window & typeof globalThis
  globalThis.document = dom.window.document
  globalThis.Element = dom.window.Element
  globalThis.SVGElement = dom.window.SVGElement
  globalThis.CSSStyleSheet = dom.window.CSSStyleSheet
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  })

  const svgPrototype = dom.window.SVGElement.prototype as SVGGraphicsElement
  if (!svgPrototype.getBBox) {
    svgPrototype.getBBox = function () {
      const text = this.textContent ?? ''
      return {
        x: 0,
        y: 0,
        width: Math.max(1, text.length * 8),
        height: 16,
      } as DOMRect
    }
  }

  mermaidModule = (await import('mermaid')).default
  mermaidModule.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
  })
  initialized = true
  return mermaidModule
}

export async function renderMermaidDiagramsInHtml(
  html: string,
): Promise<string> {
  if (!html.includes('mermaid')) {
    return html
  }

  const mermaid = await initializeMermaidRenderer()
  const dom = new JSDOM(html)
  const diagrams = Array.from(
    dom.window.document.querySelectorAll('pre.mermaid'),
  )
  for (const diagram of diagrams) {
    const source = diagram.textContent ?? ''
    if (!source.trim()) {
      continue
    }
    const { svg } = await mermaid.render(
      `asciidoc-mermaid-${++sequence}`,
      source,
    )
    const wrapper = dom.window.document.createElement('div')
    wrapper.className = 'mermaid'
    wrapper.innerHTML = svg
    diagram.replaceWith(wrapper)
  }
  return dom.serialize()
}
