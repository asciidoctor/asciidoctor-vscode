import type {
  AbstractBlock,
  BlockProcessorDslInterface,
  Reader,
} from '@asciidoctor/core'

export const MERMAID_SOURCE_DATA_URI_PREFIX = 'data:text/vnd.mermaid;base64,'

export function encodeMermaidSource(source: string): string {
  return `${MERMAID_SOURCE_DATA_URI_PREFIX}${Buffer.from(source, 'utf8').toString('base64')}`
}

export function decodeMermaidSource(target: unknown): string | undefined {
  if (
    typeof target !== 'string' ||
    !target.startsWith(MERMAID_SOURCE_DATA_URI_PREFIX)
  ) {
    return undefined
  }
  return Buffer.from(
    target.slice(MERMAID_SOURCE_DATA_URI_PREFIX.length),
    'base64',
  ).toString('utf8')
}

export function mermaidJSProcessor() {
  return function (this: BlockProcessorDslInterface) {
    this.onContext(['listing', 'literal'])
    this.process((async (
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
    }) as any)
  }
}
