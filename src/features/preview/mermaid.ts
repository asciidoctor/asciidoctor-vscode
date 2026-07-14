import type { BlockProcessorDslInterface } from '@asciidoctor/core'

export function mermaidJSProcessor() {
  return function (this: BlockProcessorDslInterface) {
    this.onContext(['listing', 'literal'])
    this.process((parent, reader, attrs) =>
      this.createBlock(
        parent,
        'pass',
        `<pre class='mermaid'>${reader.getString()}</pre>`,
        attrs,
      ),
    )
  }
}
