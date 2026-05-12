import { AbstractBlock, Document } from '@asciidoctor/core'

export function findNearestBlock(document: Document, lineNumber: number) {
  let nearestBlock: AbstractBlock | undefined
  const blocks = document.findBy({}, (block: AbstractBlock) => {
    if (block.getNodeName() === 'document') {
      return false
    }
    const sourceLocation = block.getSourceLocation()
    if (sourceLocation) {
      if (sourceLocation.getLineNumber() === lineNumber) {
        return true
      } else if (sourceLocation.getLineNumber() < lineNumber) {
        nearestBlock = block
      }
    }
    return false
  })
  if (blocks && blocks.length) {
    return blocks[0]
  }
  return nearestBlock
}
