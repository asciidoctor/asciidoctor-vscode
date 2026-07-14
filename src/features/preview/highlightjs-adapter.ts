import { SyntaxHighlighter, SyntaxHighlighterBase } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../../core/resources.js'

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

// Languages (and their aliases) shipped in the "common" Highlight.js bundle
// (media/highlightjs/highlight.min.js). They are already registered, so we must
// not load an extra script for them. Every other Highlight.js language is
// bundled individually under media/highlightjs/languages and loaded on demand.
const COMMON_HIGHLIGHTJS_LANGUAGES = new Set([
  'bash',
  'sh',
  'c',
  'h',
  'cpp',
  'cc',
  'c++',
  'h++',
  'hpp',
  'hh',
  'hxx',
  'cxx',
  'csharp',
  'cs',
  'c#',
  'css',
  'diff',
  'patch',
  'go',
  'golang',
  'graphql',
  'gql',
  'ini',
  'toml',
  'java',
  'jsp',
  'javascript',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'kotlin',
  'kt',
  'kts',
  'less',
  'lua',
  'makefile',
  'mk',
  'mak',
  'make',
  'markdown',
  'md',
  'mkdown',
  'mkd',
  'objectivec',
  'mm',
  'objc',
  'obj-c',
  'obj-c++',
  'objective-c++',
  'perl',
  'pl',
  'pm',
  'php',
  'php-template',
  'plaintext',
  'text',
  'txt',
  'python',
  'py',
  'gyp',
  'ipython',
  'python-repl',
  'pycon',
  'r',
  'ruby',
  'rb',
  'gemspec',
  'podspec',
  'thor',
  'irb',
  'rust',
  'rs',
  'scss',
  'shell',
  'console',
  'shellsession',
  'sql',
  'swift',
  'typescript',
  'ts',
  'tsx',
  'mts',
  'cts',
  'vbnet',
  'vb',
  'wasm',
  'xml',
  'html',
  'xhtml',
  'rss',
  'atom',
  'xjb',
  'xsd',
  'xsl',
  'plist',
  'wsf',
  'svg',
  'yaml',
  'yml',
])

// Collect the source languages actually used in the document, so the matching
// Highlight.js language scripts can be loaded automatically — no
// `:highlightjs-languages:` needed in the preview.
function collectUsedLanguages(doc: any): string[] {
  try {
    const languages = new Set<string>()
    doc.findBy({ context: 'listing' }).forEach((block: any) => {
      const language = block.getAttribute('language')
      if (language) {
        languages.add(language)
      }
    })
    return [...languages]
  } catch {
    // Never let language detection break the preview rendering.
    return []
  }
}

export function register(
  highlightjsBuiltInSyntaxHighlighter: any,
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
      // Languages the user requested explicitly through `:highlightjs-languages:`
      // (kept as-is, even when they belong to the common bundle).
      const explicitLanguages = doc.hasAttribute('highlightjs-languages')
        ? doc
            .getAttribute('highlightjs-languages')
            .split(',')
            .map((lang: string) => lang.trim())
        : []
      // Languages detected in the document that are not part of the common
      // bundle, so they load automatically without any configuration.
      const detectedLanguages = collectUsedLanguages(doc).filter(
        (lang) => !COMMON_HIGHLIGHTJS_LANGUAGES.has(lang),
      )
      const languages = [
        ...new Set([...explicitLanguages, ...detectedLanguages]),
      ].filter(Boolean)
      const languageScripts = languages
        .map((lang) => {
          const languageScriptResource = vscode.Uri.joinPath(
            context.extensionUri,
            'media',
            'highlightjs',
            'languages',
            `${lang}.min.js`,
          )
          return `<script src="${webviewPanel.asWebviewUri(languageScriptResource)}"></script>`
        })
        .join('\n')
      const highlightjsScriptResource = vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'highlightjs',
        'highlight.min.js',
      )
      const highlightjsInitResource = vscode.Uri.joinPath(
        context.extensionUri,
        'dist',
        'highlightjs-init.js',
      )
      return `<script src="${webviewPanel.asWebviewUri(highlightjsScriptResource)}"></script>
${languageScripts}
<script src="${webviewPanel.asWebviewUri(highlightjsInitResource)}"></script>`
    }
  }

  SyntaxHighlighter.register(
    CustomHighlightJsAdapter,
    'highlight.js',
    'highlightjs',
  )
}
