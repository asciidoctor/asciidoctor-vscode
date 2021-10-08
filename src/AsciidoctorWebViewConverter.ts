const processor = require('@asciidoctor/core')()

export class AsciidoctorWebViewConverter {
  baseConverter: any

  constructor () {
    this.baseConverter = processor.Html5Converter.create()
  }

  convert (node, transform) {
    const nodeName = transform || node.getNodeName()
    if (nodeName === 'inline_anchor' && node.type === 'link') {
      const id = node.id ? ` id="${node.id}"` : ''
      const role = node.role ? ` class="${node.role}"` : ''
      const title = node.title ? ` title="${node.title}"` : ''
      return `<a href="${node.target}"${id}${role}${title} data-href="${node.target}">${node.text}</a>`
    }
    return this.baseConverter.convert(node, transform)
  }
}
