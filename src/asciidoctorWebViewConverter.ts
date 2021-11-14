import { isSchemeBlacklisted } from './linkSanitizer'

const processor = require('@asciidoctor/core')()

interface LinkItem {
  target: string,
  text: string,
  filePath: string,
  lineText: string,
  lineNo: number,
  match?: any,
  type: string
}

/**
 * Custom converter to support VS Code WebView security and extract document metadata
 */
export class AsciidoctorWebViewConverter {
  baseConverter: any
  linkItems: LinkItem[]

  constructor () {
    this.baseConverter = processor.Html5Converter.create()
    this.linkItems = []
  }

  /**
   * Ascend the Asciidoctor AST looking for source information until it is found
   * @param node    Asciidoctor node
   * @returns       Source Location
   */
  getBlockLocation (node) {
    try {
      return node.getSourceLocation()
    } catch (err) {
      if (err instanceof TypeError) {
        return this.getBlockLocation(node.parent)
      }
    }
    return null
  }

  /**
   Convert links to ensure WebView security for preview through use of data-href attribute
   * @param node        Type of node in Asciidoctor AST
   * @param transform   An optional string transform that hints at which transformation should be applied to this node
   * @returns           Converted node
   */
  convert (node, transform): any {
    const nodeName = transform || node.getNodeName()
    const href = isSchemeBlacklisted(node.target) ? '#' : node.target
    const id = node.hasAttribute('id') ? ` id="${node.id}"` : ''
    const role = node.hasAttribute('role') ? ` class="${node.role}"` : ''
    const title = node.hasAttribute('title') ? ` title="${node.title}"` : ''
    const sourceInfo = this.getBlockLocation(node)
    if ((nodeName === 'inline_anchor' && (node.type === 'link')) || node.type === 'xref') {
      if (sourceInfo !== null) {
        const lineNo = sourceInfo.lineno
        const nearestLine = node.document.getSourceLines()[lineNo - 1]
        const linkObj: LinkItem = {
          target: node.target.endsWith('.html') ? node.target.slice(0, -5) + '.adoc' : node.target,
          text: node.text,
          filePath: sourceInfo.path, // not needed
          lineText: nearestLine,
          lineNo: lineNo,
          type: node.type,
        }
        if (sourceInfo.path === '<stdin>') {
          this.linkItems.push(linkObj)
        }
      }
      // converted element
      return `<a href="${href}"${id}${role}${title} data-href="${href}">${node.text}</a>`
    }
    return this.baseConverter.convert(node, transform)
  }
}
