import { SyntaxHighlighter, SyntaxHighlighterBase } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../../util/resources.js'

function getDefaultHighlightJsTheme(): string {
  const themeKind = vscode.window.activeColorTheme.kind
  // ColorThemeKind: Light = 1, Dark = 2, HighContrast = 3, HighContrastLight = 4
  if (
    themeKind === vscode.ColorThemeKind.Dark ||
    themeKind === vscode.ColorThemeKind.HighContrast
  ) {
    return 'github-dark'
  }
  return 'github'
}

export function register(
  highlightjsBuiltInSyntaxHighlighter,
  context: vscode.ExtensionContext,
  webviewPanel: WebviewResourceProvider,
) {
  const BaseClass: any =
    typeof highlightjsBuiltInSyntaxHighlighter === 'function'
      ? highlightjsBuiltInSyntaxHighlighter
      : SyntaxHighlighterBase

  class CustomHighlightJsAdapter extends BaseClass {
    hasDocinfo(_location: string) {
      return true
    }

    docinfo(location: string, doc: any, _opts: any) {
      if (location === 'head') {
        const theme = doc.getAttribute(
          'highlightjs-theme',
          getDefaultHighlightJsTheme(),
        )
        const themeStyleSheetResource = vscode.Uri.joinPath(
          context.extensionUri,
          'media',
          'highlightjs',
          'styles',
          `${theme}.min.css`,
        )
        return `<link rel="stylesheet" href="${webviewPanel.asWebviewUri(themeStyleSheetResource)}">`
      }
      // footer
      let languageScripts = ''
      if (doc.hasAttribute('highlightjs-languages')) {
        languageScripts = doc
          .getAttribute('highlightjs-languages')
          .split(',')
          .map((lang) => {
            const languageScriptResource = vscode.Uri.joinPath(
              context.extensionUri,
              'media',
              'highlightjs',
              'languages',
              `${lang.trim()}.min.js`,
            )
            return `<script src="${webviewPanel.asWebviewUri(languageScriptResource)}"></script>`
          })
          .join('\n')
      }
      const highlightjsScriptResource = vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'highlightjs',
        'highlight.min.js',
      )
      return `<script src="${webviewPanel.asWebviewUri(highlightjsScriptResource)}"></script>
${languageScripts}
<script>
if (!hljs.initHighlighting.called) {
  hljs.initHighlighting.called = true
  ;[].slice.call(document.querySelectorAll("pre.highlight > code")).forEach(function (el) { hljs.highlightElement(el) })
}
</script>`
    }
  }

  SyntaxHighlighter.register(
    CustomHighlightJsAdapter,
    'highlight.js',
    'highlightjs',
  )
}
