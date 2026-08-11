import type {
  AbstractBlock,
  BlockProcessorDslInterface,
  Reader,
} from '@asciidoctor/core'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
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
      const titleBlock = this.createBlock(parent, 'pass', '', attrs)
      if (title) {
        titleBlock.title = title
      }
      await titleBlock.precomputeTitle()
      titleBlock.assignCaption(caption, 'figure')

      const classNames = ['imageblock', 'mermaidblock']
      if (role) {
        classNames.push(...role.split(/\s+/).filter(Boolean))
      }
      const id = blockId ? ` id="${escapeAttribute(blockId)}"` : ''
      const captionedTitle = titleBlock.hasTitle()
        ? `\n<div class="title">${titleBlock.captionedTitle()}</div>`
        : ''
      const passAttrs = { ...attrs }
      delete passAttrs.id
      delete passAttrs.role

      return this.createBlock(
        parent,
        'pass',
        `<div${id} class="${escapeAttribute(classNames.join(' '))}">\n<div class="content">\n<pre class='mermaid'>${reader.getString()}</pre>\n</div>${captionedTitle}\n</div>`,
        passAttrs,
      )
    }) as any)
  }
}
