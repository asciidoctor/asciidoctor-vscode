import * as vscode from 'vscode'
const { Opal } = require('asciidoctor-opal-runtime')

module.exports.register = (highlightjsBuiltInSyntaxHighlighter, context: vscode.ExtensionContext, webviewPanel: vscode.WebviewPanel) => {
  const customHighlightJsAdapter = Opal.klass(Opal.nil, highlightjsBuiltInSyntaxHighlighter, 'CustomHighlightJsAdapter')
  customHighlightJsAdapter.$register_for('highlight.js', 'highlightjs')

  let $docinfo
  Opal.def(customHighlightJsAdapter, '$docinfo', $docinfo = function $$docinfo (location, doc, _opts) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const self = this
    if (location === 'head') {
      const theme = doc.$attr('highlightjs-theme', 'github')
      const themeStyleSheetResource = vscode.Uri.joinPath(context.extensionUri, 'media', 'highlightjs', 'styles', `${theme}.min.css`)
      return `<link rel="stylesheet" href="${webviewPanel.webview.asWebviewUri(themeStyleSheetResource)}">`
    }
    // footer
    let languageScripts = ''
    if (doc['$attr?']('highlightjs-languages')) {
      languageScripts = doc.$attr('highlightjs-languages').split(',').map((lang) => {
        const languageScriptResource = vscode.Uri.joinPath(context.extensionUri, 'media', 'highlightjs', 'languages', `${lang.trim()}.min.js`)
        return `<script src="${webviewPanel.webview.asWebviewUri(languageScriptResource)}"></script>`
      }).join('\n')
    }
    const highlightjsScriptResource = vscode.Uri.joinPath(context.extensionUri, 'media', 'highlightjs', 'highlight.min.js')
    return `<script src="${webviewPanel.webview.asWebviewUri(highlightjsScriptResource)}"></script>
${languageScripts}
<script>
if (!hljs.initHighlighting.called) {
  hljs.initHighlighting.called = true
  ;[].slice.call(document.querySelectorAll("pre.highlight > code")).forEach(function (el) { hljs.highlightElement(el) })
}
</script>`
  }, $docinfo.$$arity = 3)
}
