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

// Modeled as an Asciidoctor `image` block (source stashed in `target` as a data
// URI) rather than a `pass` block writing raw HTML, so a block `.Title` goes
// through the same `precomputeTitle`/`assignCaption` machinery as any other
// figure — and so tree processors that adjust image captions (e.g.
// asciidoctor-numbered-captions) see and can rewrite it like a Kroki diagram.
// The default image markup this produces (an `<img>` whose `src` is the data
// URI) is meaningful on its own: the preview's injected Mermaid script decodes
// it client-side and renders it with `mermaid.render()` (see
// asciidoctorWebViewConverter.ts, generateMermaid()). Plain HTML export doesn't
// carry that script yet, so it still shows a broken image there — that's a
// separate, later change.
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
