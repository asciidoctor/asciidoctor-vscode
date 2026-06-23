import type {
  AbstractBlock,
  Block,
  BlockProcessorDslInterface,
  Processor,
  Reader,
} from '@asciidoctor/core'

/**
 * Inside `registry.block(name, function () { … })`, `this` is the block
 * processor instance. It exposes both the registration DSL (`onContext`,
 * `process`, …) and the node factory methods (`createPassBlock`, …).
 */
type BlockProcessorContext = BlockProcessorDslInterface & Processor

export function mermaidJSProcessor() {
  return function (this: BlockProcessorContext) {
    this.onContext(['listing', 'literal'])
    this.process(
      (
        parent: AbstractBlock,
        reader: Reader,
        attrs: Record<string, unknown>,
      ): Block =>
        this.createPassBlock(
          parent,
          `<pre class='mermaid'>${reader.getString()}</pre>`,
          attrs,
        ),
    )
  }
}
