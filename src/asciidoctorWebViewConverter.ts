import vscode from 'vscode'
import * as uri from 'vscode-uri'
import { AsciidocPreviewSecurityLevel, ContentSecurityPolicyArbiter } from './security'
import { AsciidocPreviewConfiguration, AsciidocPreviewConfigurationManager } from './features/previewConfig'
import { WebviewResourceProvider } from './util/resources'
import { Asciidoctor } from '@asciidoctor/core'
import { SkinnyTextDocument } from './util/document'
import * as nls from 'vscode-nls'
import { AsciidocContributionProvider } from './asciidocExtensions'

const localize = nls.loadMessageBundle()

const { Opal } = require('asciidoctor-opal-runtime')
const processor = require('@asciidoctor/core')()

const BAD_PROTO_RE = /^(vbscript|javascript|data):/i
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/i

/**
 * Disallow blacklisted URL types following MarkdownIt and the VS Code Markdown extension
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
 * Strings used inside the asciidoc preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
  cspAlertMessageText: localize(
    'preview.securityMessage.text',
    'Some content has been disabled in this document'),

  cspAlertMessageTitle: localize(
    'preview.securityMessage.title',
    'Potentially unsafe or insecure content has been disabled in the Asciidoc preview. Change the Asciidoc preview security setting to allow insecure content or enable scripts'),

  cspAlertMessageLabel: localize(
    'preview.securityMessage.label',
    'Content Disabled Security Warning'),
}

/**
 * @param securityLevel
 * @param nonce
 */
function getCspForResource (provider: WebviewResourceProvider, securityLevel: AsciidocPreviewSecurityLevel, nonce: string): string {
  const rule = provider.cspSource
  const highlightjsInlineScriptHash = 'sha256-ZrDBcrmObbqhVV/Mag2fT/y08UJGejdW7UWyEsi4DXw='
  switch (securityLevel) {
    case AsciidocPreviewSecurityLevel.AllowInsecureContent:
      return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} http: https: data:; media-src 'self' ${rule} http: https: data:; script-src 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src 'self' ${rule} 'unsafe-inline' http: https: data:; font-src 'self' ${rule} http: https: data:;">`

    case AsciidocPreviewSecurityLevel.AllowInsecureLocalContent:
      return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; media-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src 'self' ${rule} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*;">`

    case AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent:
      return '<meta http-equiv="Content-Security-Policy" content="">'

    case AsciidocPreviewSecurityLevel.Strict:
    default:
      return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} https: data:; media-src 'self' ${rule} https: data:; script-src 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src 'self' ${rule} 'unsafe-inline' https: data:; font-src 'self' ${rule} https: data:;">`
  }
}

function escapeAttribute (value: string | vscode.Uri): string {
  return value.toString().replace(/"/g, '&quot;')
}

/**
 * Custom converter to support VS Code WebView security
 */
export class AsciidoctorWebViewConverter {
  baseConverter: any
  basebackend: string
  outfilesuffix: string
  securityLevel: AsciidocPreviewSecurityLevel
  config: AsciidocPreviewConfiguration
  initialData: { [key: string]: any }
  state: object

  constructor (
    private readonly textDocument: SkinnyTextDocument,
    private readonly context: vscode.ExtensionContext,
    private readonly editor: vscode.WebviewPanel,
    cspArbiter: ContentSecurityPolicyArbiter,
    private readonly contributionProvider: AsciidocContributionProvider,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    line: number | undefined = undefined,
    state?: any
  ) {
    this.basebackend = 'html'
    this.outfilesuffix = '.html'
    this.baseConverter = processor.Html5Converter.create()
    const textDocumentUri = textDocument.uri
    this.securityLevel = cspArbiter.getSecurityLevelForResource(textDocumentUri)
    this.config = previewConfigurations.loadAndCacheConfiguration(textDocumentUri)
    this.initialData = {
      source: textDocumentUri.toString(),
      line,
      lineCount: textDocument.lineCount,
      scrollPreviewWithEditor: this.config.scrollPreviewWithEditor,
      scrollEditorWithPreview: this.config.scrollEditorWithPreview,
      doubleClickToSwitchToEditor: this.config.doubleClickToSwitchToEditor,
      preservePreviewWhenHidden: this.config.preservePreviewWhenHidden,
      disableSecurityWarnings: cspArbiter.shouldDisableSecurityWarnings(),
    }
    this.state = state || {}
  }

  /**
   Convert links to ensure WebView security for preview through use of data-href attribute
   * @param node        Type of node in Asciidoctor AST
   * @param transform   An optional string transform that hints at which transformation should be applied to this node
   * @returns           Converted node
   */
  convert (node, transform) {
    const nodeName = transform || node.getNodeName()
    if (nodeName === 'document') {
      // Content Security Policy
      const nonce = new Date().getTime() + '' + new Date().getMilliseconds()
      const resourceProvider = this.editor.webview
      const csp = getCspForResource(resourceProvider, this.securityLevel, nonce)
      const content = node.getContent()
      const syntaxHighlighter = node.$syntax_highlighter()
      let assetUriScheme = node.getAttribute('asset-uri-scheme', 'https')
      if (assetUriScheme.trim() !== '') {
        assetUriScheme = `${assetUriScheme}:`
      }
      const syntaxHighlighterHeadContent = (syntaxHighlighter !== Opal.nil && syntaxHighlighter['$docinfo?']('head'))
        ? syntaxHighlighter.$docinfo('head', node, {})
        : ''
      const syntaxHighlighterFooterContent = (syntaxHighlighter !== Opal.nil && syntaxHighlighter['$docinfo?']('footer'))
        ? syntaxHighlighter.$docinfo('footer', node, {})
        : ''
      const headerDocinfo = node.getDocinfo('header')
      const footerDocinfo = node.getDocinfo('footer')
      return `<!DOCTYPE html>
     <html style="${escapeAttribute(this.getSettingsOverrideStyles(this.config))}">
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
        ${csp}
        <meta id="vscode-asciidoc-preview-data"
          data-settings="${escapeAttribute(JSON.stringify(this.initialData))}"
          data-strings="${escapeAttribute(JSON.stringify(previewStrings))}"
          data-state="${escapeAttribute(JSON.stringify(this.state))}">
        <script src="${this.extensionResourcePath('pre.js')}" nonce="${nonce}"></script>
        ${this.getStyles(node, resourceProvider, this.textDocument.uri, this.config, this.state)}
        ${syntaxHighlighterHeadContent}
        ${node.getDocinfo()}
        <base href="${resourceProvider.asWebviewUri(this.textDocument.uri)}">
      </head>
      <body${node.getId() ? ` id="${node.getId()}"` : ''} class="${this.getBodyCssClasses(node)}">
        ${headerDocinfo}
        ${this.getDocumentHeader(node)}
        <div id="content">
          ${content}
        </div>
        ${this.generateFootnotes(node)}
        ${this.generateFooter(node)}
        <div class="code-line" data-line="${this.textDocument.lineCount}"></div>
        ${this.getScripts(resourceProvider, nonce)}
        ${syntaxHighlighterFooterContent}
        ${this.generateMathJax(node, resourceProvider, nonce)}
        ${footerDocinfo}
      </body>
      </html>`
    }
    if (nodeName === 'inline_anchor' && node.type === 'link') {
      const href = isSchemeBlacklisted(node.target) ? '#' : node.target
      const id = node.hasAttribute('id') ? ` id="${node.id}"` : ''
      const role = node.hasAttribute('role') ? ` class="${node.role}"` : ''
      const title = node.hasAttribute('title') ? ` title="${node.title}"` : ''
      return `<a href="${href}"${id}${role}${title} data-href="${href}">${node.text}</a>`
    }
    return this.baseConverter.convert(node, transform)
  }

  private generateMathJax (node, resourceProvider, nonce) {
    if (node.isAttribute('stem')) {
      let eqnumsVal = node.getAttribute('eqnums', 'none')
      if (eqnumsVal && eqnumsVal.trim().length === 0) {
        eqnumsVal = 'AMS'
      }
      const eqnumsOpt = ` equationNumbers: { autoNumber: "${eqnumsVal}" } `
      return `<script nonce="${nonce}">
MathJax = {
  messageStyle: "none",
  // does not work in a sandbox environment
  showMathMenu: false,
  tex2jax: {
    inlineMath: [['\\\\(', '\\\\)']],
    displayMath: [['\\\\[', '\\\\]']],
    ignoreClass: "nostem|nolatexmath"
  },
  asciimath2jax: {
    delimiters: [['\\\\$', '\\\\$']],
    ignoreClass: "nostem|noasciimath"
  },
  TeX: {${eqnumsOpt}}
}
</script>
<script src="${escapeAttribute(resourceProvider.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mathjax', 'MathJax.js')))}?config=TeX-MML-AM_HTMLorMML" nonce="${nonce}"></script>
<script nonce="${nonce}">
MathJax.Hub.Register.StartupHook("AsciiMath Jax Ready", function () {
  MathJax.InputJax.AsciiMath.postfilterHooks.Add(function (data, node) {
    if ((node = data.script.parentNode) && (node = node.parentNode) && node.classList.contains("stemblock")) {
      data.math.root.display = "block"
    }
    return data
  })
})
</script>`
    }
    return ''
  }

  private generateFootnotes (node) {
    if (node.hasFootnotes() && !(node.isAttribute('nofootnotes'))) {
      const footnoteItems = node.getFootnotes().map((footnote) => {
        return `<div class="footnote" id="_footnotedef_${footnote.getIndex()}">
<a href="#_footnoteref_${footnote.getIndex()}">${footnote.getIndex()}</a>. ${footnote.getText()}
</div>`
      })
      return `<div id="footnotes">
<hr/>
${footnoteItems.join('\n')}
</div>`
    }
    return ''
  }

  private generateFooter (node) {
    if (node.getNofooter()) {
      return ''
    }
    const footerInfos = []
    if (node.isAttribute('revnumber')) {
      footerInfos.push(`${node.getAttribute('version-label')} ${node.getAttribute('revnumber')}<br/>`)
    }
    const reproducible = node.isAttribute('reproducible')
    if (node.isAttribute('last-update-label') && !reproducible) {
      footerInfos.push(`${node.getAttribute('last-update-label')} ${node.getAttribute('docdatetime')}`)
    }
    return `<div id="footer">
<div id="footer-text">
${footerInfos.join('\n')}
</div>
</div>`
  }

  private getDocumentHeader (node) {
    if (node.getNoheader()) {
      return ''
    }
    const maxWidthAttr = node.hasAttribute('max-width') ? ` style="max-width: ${node.getAttribute('max-width')};"` : ''
    const doctype = node.getDoctype()
    const headerContent = doctype === 'manpage'
      ? this.generateManPageHeader(node)
      : this.generateArticleHeader(node)
    return `<div id="header"${maxWidthAttr}>
${headerContent}
</div>`
  }

  private generateArticleHeader (node) {
    const content = []
    if (node.hasHeader()) {
      if (!node.getNotitle()) {
        content.push(`<h1>${node.getHeader().getTitle()}</h1>`)
      }
      const details = this.generateHeaderDetails(node)
      if (details) {
        content.push(details)
      }
    }
    if (node.hasSections() && node.hasAttribute('toc') && node.hasAttribute('toc-placement', 'auto')) {
      content.push(`<div id="toc" class="${node.getAttribute('toc-class', 'toc')}">
  <div id="toctitle">${node.getAttribute('toc-title')}</div>
  ${node.getConverter().convert(node, 'outline')}
</div>`)
    }
    return content.join('\n')
  }

  private generateHeaderDetails (node) {
    const details = []
    node.getAuthors().forEach((author, idx) => {
      details.push(`<span id="author${idx > 0 ? idx + 1 : ''}" class="author">${node.$sub_replacements(author.getName())}</span><br/>`)
      const authorEmail = author.getEmail()
      if (authorEmail) {
        details.push(`<span id="email${idx > 0 ? idx + 1 : ''}" class="email">${node.$sub_macros(authorEmail)}</span><br/>`)
      }
    })
    if (node.hasAttribute('revnumber')) {
      const versionLabel = (node.getAttribute('version-label') || '').toLowerCase()
      details.push(`<span id="revnumber">${versionLabel} ${node.getAttribute('revnumber')}${node.hasAttribute('revdate') ? ',' : ''}</span>`)
    }
    if (node.hasAttribute('revdate')) {
      details.push(`<span id="revdate">${node.getAttribute('revdate')}</span>`)
    }
    if (node.hasAttribute('revremark')) {
      details.push(`<span id="revremark">${node.getAttribute('revremark')}</span>`)
    }
    if (details.length > 0) {
      return `<div class="details">
${details.join('\n')}
</div>`
    }
    return ''
  }

  private generateManPageHeader (node) {
    const tocContent = node.hasSections() && node.hasAttribute('toc') && node.hasAttribute('toc-placement', 'auto')
      ? `<div id="toc" class="${node.getAttribute('toc-class', 'toc')}">
<div id="toctitle">${node.getAttribute('toc-title')}</div>
${node.getConverter().convert(node, 'outline')}
</div>`
      : ''
    return `<h1>${node.getDoctitle()} Manual Page</h1>
${tocContent}
${node.hasAttribute('manpurpose') ? this.generateManNameSection(node) : ''}`
  }

  private generateManNameSection (node) {
    let mannameTitle = node.getAttribute('manname-title', 'Name')
    const nextSection = node.getSections()[0]
    if (nextSection && nextSection.getTitle() === nextSection.getTitle().toUpperCase()) {
      mannameTitle = mannameTitle.toUpperCase()
    }
    const mannameIdAttr = node.getAttribute('manname-id') ? ` id="${node.getAttribute('manname-id')}"` : ''
    return `<h2${mannameIdAttr}>${mannameTitle}</h2>
  <div class="sectionbody">
    <p>${node.getAttribute('mannames').join(', ')} - ${node.getAttribute('manpurpose')}</p>
  </div>`
  }

  private getBodyCssClasses (node) {
    const classes = [
      'vscode-body',
      this.config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : undefined,
      this.config.wordWrap ? 'wordWrap' : undefined,
      this.config.markEditorSelection ? 'showEditorSelection' : undefined,
    ]
    const sectioned = node.hasSections()
    if (sectioned && node.isAttribute('toc-class') && node.isAttribute('toc') && node.isAttribute('toc-placement', 'auto')) {
      classes.push(
        node.getDoctype(),
        node.getAttribute('toc-class'),
        `toc-${node.getAttribute('toc-position', 'header')}`
      )
    } else {
      classes.push(node.getDoctype())
    }
    if (node.isRole()) {
      classes.push(node.getRole())
    }
    return classes
      .filter((cssClass) => cssClass !== undefined)
      .join(' ')
  }

  private getSettingsOverrideStyles (config: AsciidocPreviewConfiguration): string {
    return [
      config.fontFamily ? `--asciidoc-font-family: ${config.fontFamily};` : '',
      isNaN(config.fontSize) ? '' : `--asciidoc-font-size: ${config.fontSize}px;`,
      isNaN(config.lineHeight) ? '' : `--asciidoc-line-height: ${config.lineHeight};`,
    ].join(' ')
  }

  private extensionResourcePath (mediaFile: string): string {
    const webviewResource = this.editor.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', mediaFile))
    return webviewResource.toString()
  }

  private getStyles (node: Asciidoctor.Document, resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: AsciidocPreviewConfiguration, state?: any): string {
    const baseStyles: string[] = []
    for (const resource of this.contributionProvider.contributions.previewStyles) {
      baseStyles.push(`<link rel="stylesheet" type="text/css" href="${escapeAttribute(resourceProvider.asWebviewUri(resource))}">`)
    }
    // QUESTION: should we support `stylesdir` and `stylesheet` attributes?
    if (config.previewStyle === '') {
      const builtinStylesheet = config.useEditorStylesheet ? 'asciidoctor-editor.css' : 'asciidoctor-default.css'
      baseStyles.push(`<link rel="stylesheet" type="text/css" href="${escapeAttribute(resourceProvider.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', builtinStylesheet)))}">`)
    }
    if (node.isAttribute('icons', 'font')) {
      baseStyles.push(`<link rel="stylesheet" href="${escapeAttribute(resourceProvider.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'font-awesome', 'css', 'font-awesome.css')))}">`)
    }
    return `${baseStyles.join('\n')}
  ${this.computeCustomStyleSheetIncludes(resourceProvider, resource, config)}
  ${this.getImageStabilizerStyles(state)}`
  }

  private getScripts (resourceProvider: WebviewResourceProvider, nonce: string): string {
    const out: string[] = []
    for (const resource of this.contributionProvider.contributions.previewScripts) {
      out.push(`<script async src="${escapeAttribute(resourceProvider.asWebviewUri(resource))}" nonce="${nonce}" charset="UTF-8"></script>`)
    }
    return out.join('\n')
  }

  private computeCustomStyleSheetIncludes (resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: AsciidocPreviewConfiguration): string {
    const style = config.previewStyle
    if (style === '') {
      return ''
    }
    const out: string[] = []
    out.push(`<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(style)}" href="${escapeAttribute(this.fixHref(resourceProvider, resource, style))}" type="text/css" media="screen">`)
    return out.join('\n')
  }

  private getImageStabilizerStyles (state?: any) {
    let ret = '<style>\n'
    if (state && state.imageInfo) {
      state.imageInfo.forEach((imgInfo: any) => {
        ret += `#${imgInfo.id}.loading {
  height: ${imgInfo.height}px
  width: ${imgInfo.width}px
}\n`
      })
    }
    ret += '</style>\n'

    return ret
  }

  private fixHref (resourceProvider: WebviewResourceProvider, resource: vscode.Uri, href: string): string {
    // QUESTION: should we use `stylesdir` attribute in here?
    if (!href) {
      return href
    }

    if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('file:')) {
      return href
    }

    // Assume it must be a local file
    if (href.startsWith('/') || /^[a-z]:\\/i.test(href)) {
      return resourceProvider.asWebviewUri(vscode.Uri.file(href)).toString()
    }

    // Use a workspace relative path if there is a workspace
    const root = vscode.workspace.getWorkspaceFolder(resource)
    if (root) {
      return resourceProvider.asWebviewUri(vscode.Uri.joinPath(root.uri, href)).toString()
    }

    // Otherwise look relative to the AsciiDoc file
    return resourceProvider.asWebviewUri(vscode.Uri.joinPath(uri.Utils.dirname(resource), href)).toString()
  }
}
