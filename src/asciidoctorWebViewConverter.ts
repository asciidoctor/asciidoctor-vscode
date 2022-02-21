const processor = require('@asciidoctor/core')()

const BAD_PROTO_RE = /^(vbscript|javascript|data):/i
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/i

/**
 * Disallow blacklisted URL types following MarkdownIt and the
 * VS Code Markdown extension
 * @param   {String}  href   The link address
 * @returns {boolean}        Whether the link is valid
 */
function isSchemeBlacklisted (href: string): boolean {
  const hrefCheck = href.trim()
  if (BAD_PROTO_RE.test(hrefCheck)) {
    // we still allow specific safe "data:image/" URIs
    return !GOOD_DATA_RE.test(hrefCheck)
  }
  return false
}

/**
 * Custom converter to support VS Code WebView security
 */
export class AsciidoctorWebViewConverter {
  baseConverter: any
  basebackend: string
  outfilesuffix: string

  constructor () {
    this.basebackend = 'html'
    this.outfilesuffix = '.html'
    this.baseConverter = processor.Html5Converter.create()
  }

  /**
   Convert links to ensure WebView security for preview through use of data-href attribute
   * @param node        Type of node in Asciidoctor AST
   * @param transform   An optional string transform that hints at which transformation should be applied to this node
   * @returns           Converted node
   */
  convert (node, transform) {
    const nodeName = transform || node.getNodeName()
    if (nodeName === 'inline_anchor' && node.type === 'link') {
      const href = isSchemeBlacklisted(node.target) ? '#' : node.target
      const id = node.hasAttribute('id') ? ` id="${node.id}"` : ''
      const role = node.hasAttribute('role') ? ` class="${node.role}"` : ''
      const title = node.hasAttribute('title') ? ` title="${node.title}"` : ''
      return `<a href="${href}"${id}${role}${title} data-href="${href}">${node.text}</a>`
    }
    return this.baseConverter.convert(node, transform)
  }
}
