// from https://github.com/cdnjs/SRIs/blob/master/highlight.js/9.18.3.json
import * as sri from './highlightjs-sri-9.18.3.json'
const { Opal } = require('asciidoctor-opal-runtime')

module.exports.register = (asciidoctor) => {
  const HighlightjsSyntaxHighlighter = asciidoctor.SyntaxHighlighter.for('highlight.js')
  const customHighlightJsAdapter = Opal.klass(Opal.nil, HighlightjsSyntaxHighlighter, 'CustomHighlightJsAdapter')
  customHighlightJsAdapter.$register_for('highlight.js', 'highlightjs')
  let $docinfo
  const baseUrl = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.18.3'
  Opal.def(customHighlightJsAdapter, '$docinfo', $docinfo = function $$docinfo (location, doc, _opts) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const self = this
    if (location === 'head') {
      const theme = doc.$attr('highlightjs-theme', 'github')
      const integrityValue = sri[`styles/${theme}.min.css`]
      return `<link rel="stylesheet" href="${baseUrl}/styles/${theme}.min.css" ${integrityValue ? `integrity="${integrityValue}" ` : ''}crossorigin="anonymous" referrerpolicy="no-referrer">`
    }
    // footer
    let languageScripts = ''
    if (doc['$attr?']('highlightjs-languages')) {
      languageScripts = doc.$attr('highlightjs-languages').split(',').map((lang) => {
        const key = `languages/${lang.trim()}.min.js`
        const integrityValue = sri[key]
        return `<script src="${baseUrl}/${key}" ${integrityValue ? `integrity="${integrityValue}" ` : ''}crossorigin="anonymous" referrerpolicy="no-referrer"></script>`
      }).join('\n')
    }
    return `<script src="${baseUrl}/highlight.min.js" integrity="${sri['highlight.min.js']}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
${languageScripts}
<script>
if (!hljs.initHighlighting.called) {
  hljs.initHighlighting.called = true
  ;[].slice.call(document.querySelectorAll("pre.highlight > code")).forEach(function (el) { hljs.highlightBlock(el) })
}
</script>`
  }, $docinfo.$$arity = 3)
}
