import type {
  AbstractBlock,
  BlockProcessorDslInterface,
  Reader,
} from '@asciidoctor/core'

export const MERMAID_SOURCE_DATA_URI_PREFIX = 'data:text/vnd.mermaid;base64,'

// `Buffer` is a Node global, unavailable in the VS Code for the Web extension
// host — fall back to `TextEncoder`/`btoa` there, like `encodeBase64` does in
// asciidoctorWebViewConverter.ts.
export function encodeMermaidSource(source: string): string {
  const bytes = new TextEncoder().encode(source)
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(String.fromCharCode(...bytes))
  return `${MERMAID_SOURCE_DATA_URI_PREFIX}${base64}`
}

// The client-side JS (as a string, not executed here) that decodes a `[mermaid]`
// image block's data URI and renders it in the browser with `mermaid.render()`,
// swapping the `<img>` for the resulting SVG. Shared verbatim between the live
// preview (generateMermaid() in asciidoctorWebViewConverter.ts, which loads
// mermaid.js as a webview resource) and HTML export (mermaidExport.ts, which
// loads it from a CDN) — only how `mermaid` itself is loaded/initialized
// differs between the two; the decode/render/replace logic is identical.
// Assumes a `mermaid` (already initialized) is in scope where this is inlined.
export function mermaidClientRenderScript(): string {
  return `
    const MERMAID_SOURCE_PREFIX = ${JSON.stringify(MERMAID_SOURCE_DATA_URI_PREFIX)};
    let mermaidRenderCount = 0;
    async function renderMermaidImage(img) {
      const base64 = img.getAttribute('src').slice(MERMAID_SOURCE_PREFIX.length);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const source = new TextDecoder().decode(bytes);
      const id = 'mermaid-diagram-' + (mermaidRenderCount++);
      const { svg, bindFunctions } = await mermaid.render(id, source);
      const container = document.createElement('div');
      container.className = 'mermaid';
      container.innerHTML = svg;
      img.replaceWith(container);
      bindFunctions?.(container);
    }
    async function renderMermaidImages(nodes) {
      const selector = 'img[src^="' + MERMAID_SOURCE_PREFIX + '"]';
      const images = new Set();
      for (const node of nodes) {
        if (node.matches?.(selector)) {
          images.add(node);
        }
        node.querySelectorAll?.(selector).forEach((img) => images.add(img));
      }
      for (const img of images) {
        try {
          await renderMermaidImage(img);
        } catch (e) {
          console.error('Mermaid rendering failed', e);
        }
      }
    }
  `
}

// Modeled as an Asciidoctor `image` block (source stashed in `target` as a data
// URI) rather than a `pass` block writing raw HTML, so a block `.Title` goes
// through the same `precomputeTitle`/`assignCaption` machinery as any other
// figure — and so tree processors that adjust image captions (e.g.
// asciidoctor-numbered-captions) see and can rewrite it like a Kroki diagram.
// The default image markup this produces (an `<img>` whose `src` is the data
// URI) is meaningful on its own: both the preview and HTML export decode it
// client-side and render it with `mermaid.render()` (see
// mermaidClientRenderScript() above).
export function mermaidJSProcessor() {
  return function (this: BlockProcessorDslInterface) {
    this.onContext(['listing', 'literal'])
    this.process(
      (
        parent: AbstractBlock,
        reader: Reader,
        attrs: Record<string, unknown>,
      ) => {
        const title = typeof attrs.title === 'string' ? attrs.title : undefined
        const caption =
          typeof attrs.caption === 'string' ? attrs.caption : undefined
        const role = typeof attrs.role === 'string' ? attrs.role : undefined
        const blockId = typeof attrs.id === 'string' ? attrs.id : undefined
        const blockAttrs = { ...attrs }
        blockAttrs.role = role ? `mermaidblock ${role}` : 'mermaidblock'
        blockAttrs.target = encodeMermaidSource(reader.getString())
        blockAttrs.alt = title || 'Mermaid diagram'
        delete blockAttrs.title
        delete blockAttrs.caption
        delete blockAttrs.opts
        const block = (this as any).createImageBlock(parent, blockAttrs)
        if (title) {
          block.title = title
        }
        if (blockId) {
          block.id = blockId
        }
        block.assignCaption(caption, 'figure')
        return block
      },
    )
  }
}
