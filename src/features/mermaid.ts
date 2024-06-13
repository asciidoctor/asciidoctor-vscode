export function mermaidJSProcessor () {
  return function () {
    const self = this
    self.onContext(['listing', 'literal'])
    self.process((parent, reader, attrs) => {
      const diagramText = reader.$read()
      return this.createPassBlock(parent, `<pre class='mermaid'>${diagramText}</pre>`, attrs)
    })
  }
}
