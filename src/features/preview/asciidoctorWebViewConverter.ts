import {
  Document as AsciidoctorDocument,
  Html5Converter,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import * as uri from 'vscode-uri'
import { SkinnyTextDocument } from '../../core/document.js'
import { t as l10nT } from '../../core/l10n.js'
import { logger } from '../../core/logger.js'
import { WebviewResourceProvider } from '../../core/resources.js'
import { getWorkspaceFolder } from '../../core/workspace.js'
import { AntoraDocumentContext } from '../antora/antoraContext.js'
import { AsciidocContributions } from '../extensionContributions.js'
import { AsciidocPreviewSecurityLevel } from '../security.js'
import { buildCustomStyleSheetLinks } from './customStyles.js'
import { renderMathJax } from './mathjax.js'
import { AsciidocPreviewConfiguration } from './previewConfig.js'

const BAD_PROTO_RE = /^(vbscript|javascript|data):/i
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/i

const IMAGE_MIME_TYPES: { [ext: string]: string } = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

function mimeTypeForTarget(target: string): string {
  const ext = target.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase()
  return IMAGE_MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Base64-encode raw bytes in a way that works in both the Node desktop
 * extension host (`Buffer`) and the browser extension host (`btoa`).
 */
function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    )
  }
  return btoa(binary)
}

/**
 * Disallow blacklisted URL types following MarkdownIt and the VS Code Markdown extension
 * @param   {String}  href   The link address
 * @returns {boolean}        Whether the link is valid
 */
function isSchemeBlacklisted(href: string): boolean {
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
  cspAlertMessageText: l10nT('preview.securityMessage.text'),

  cspAlertMessageTitle: l10nT('preview.securityMessage.title'),

  cspAlertMessageLabel: l10nT('preview.securityMessage.label'),
}

/**
 * @param webviewResourceProvider
 * @param securityLevel
 * @param krokiServerUrl
 * @param nonce
 */
function getCspForResource(
  webviewResourceProvider: WebviewResourceProvider,
  securityLevel: AsciidocPreviewSecurityLevel,
  krokiServerUrl: string,
  nonce: string,
): string {
  if (
    securityLevel === AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent
  ) {
    return '<meta http-equiv="Content-Security-Policy" content="">'
  }
  const rule = webviewResourceProvider.cspSource
  const rules = {
    'default-src': ["'none'"],
    'img-src': ["'self'", rule, 'https:', 'data:', krokiServerUrl],
    'object-src': ["'self'", rule, 'https:', 'data:', krokiServerUrl],
    'media-src': ["'self'", rule, 'https:', 'data:', krokiServerUrl],
    'script-src': [
      rule,
      'https:',
      `'nonce-${nonce}'`,
      'https://*.vscode-cdn.net/',
    ],
    'style-src': ["'self'", rule, 'https:', "'unsafe-inline'", 'data:'],
    // add font-src about: as a workaround: https://github.com/mathjax/MathJax/issues/256#issuecomment-37990603
    'font-src': ["'self'", rule, 'https:', 'data:', 'about:'],
  }
  if (securityLevel === AsciidocPreviewSecurityLevel.AllowInsecureContent) {
    // allow "insecure" content (http protocol)
    rules['img-src'] = [...rules['img-src'], 'http:']
    rules['object-src'] = [...rules['object-src'], 'http:']
    rules['media-src'] = [...rules['media-src'], 'http:']
    rules['style-src'] = [...rules['style-src'], 'http:']
    rules['font-src'] = [...rules['font-src'], 'http:']
  } else if (
    securityLevel === AsciidocPreviewSecurityLevel.AllowInsecureLocalContent
  ) {
    rules['img-src'] = [
      ...rules['img-src'],
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]
    rules['object-src'] = [
      ...rules['object-src'],
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]
    rules['media-src'] = [
      ...rules['media-src'],
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]
    rules['style-src'] = [
      ...rules['style-src'],
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]
    rules['font-src'] = [
      ...rules['font-src'],
      'http://localhost:*',
      'http://127.0.0.1:*',
    ]
  }
  return `<meta http-equiv="Content-Security-Policy" content="${Object.entries(
    rules,
  )
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')}">`
}

function escapeAttribute(value: string | vscode.Uri): string {
  return value.toString().replace(/"/g, '&quot;')
}

/**
 * Custom converter to support VS Code WebView security
 */
export class AsciidoctorWebViewConverter {
  baseConverter: any
  basebackend: string
  outfilesuffix: string
  supports_templates: boolean
  securityLevel: AsciidocPreviewSecurityLevel
  config: AsciidocPreviewConfiguration
  initialData: { [key: string]: any }
  state: object

  constructor(
    private readonly textDocument: SkinnyTextDocument,
    private readonly webviewResourceProvider: WebviewResourceProvider,
    asciidocPreviewSecurityLevel: AsciidocPreviewSecurityLevel,
    shouldDisableSecurityWarnings: boolean,
    private readonly contributions: AsciidocContributions,
    previewConfigurations: AsciidocPreviewConfiguration,
    private readonly antoraDocumentContext: AntoraDocumentContext | undefined,
    line: number | undefined = undefined,
    state?: any,
    private readonly krokiServerUrl?: string,
    private readonly dataUriEnabled: boolean = false,
    fragment: string | undefined = undefined,
  ) {
    const textDocumentUri = textDocument.uri
    this.basebackend = 'html'
    this.outfilesuffix = '.html'
    this.supports_templates = true
    this.baseConverter = Html5Converter.create()
    // NOTE: `supports_templates` above was the Asciidoctor.js < 4 (Opal) flag;
    // 4.0 reads a `hasSupportsTemplates()` method instead (see below), so a
    // custom converter that only sets the old property would silently disable
    // custom templates in the preview.
    this.securityLevel = asciidocPreviewSecurityLevel
    this.config = previewConfigurations
    this.initialData = {
      source: textDocumentUri.toString(),
      line,
      // Anchor id to scroll to once this render has loaded (interdocument link
      // navigation); empty for ordinary renders.
      fragment,
      lineCount: textDocument.lineCount,
      scrollPreviewWithEditor: this.config.scrollPreviewWithEditor,
      scrollEditorWithPreview: this.config.scrollEditorWithPreview,
      doubleClickToSwitchToEditor: this.config.doubleClickToSwitchToEditor,
      preservePreviewWhenHidden: this.config.preservePreviewWhenHidden,
      disableSecurityWarnings: shouldDisableSecurityWarnings,
      // Verbose preview-console diagnostics follow the *Asciidoctor* output
      // channel level (raised via "Developer: Set Log Level…"), not a dedicated
      // setting: at Trace, the webview logs `[asciidoc.preview]` messages.
      debug: logger.logLevel === vscode.LogLevel.Trace,
    }
    this.state = state || {}
  }

  /**
   Convert links to ensure WebView security for preview through use of data-href attribute
   * @param node        Type of node in Asciidoctor AST
   * @param transform   An optional string transform that hints at which transformation should be applied to this node
   * @returns           Converted node
   */
  async convert(node, transform) {
    const nodeName = transform || node.getNodeName()
    if (nodeName === 'document') {
      // Content Security Policy
      const nonce = new Date().getTime() + '' + new Date().getMilliseconds()
      const webviewResourceProvider = this.webviewResourceProvider
      const csp = getCspForResource(
        webviewResourceProvider,
        this.securityLevel,
        this.krokiServerUrl,
        nonce,
      )
      const syntaxHighlighter = node.getSyntaxHighlighter()
      let assetUriScheme = node.getAttribute('asset-uri-scheme', 'https')
      if (assetUriScheme.trim() !== '') {
        assetUriScheme = `${assetUriScheme}:`
      }
      const syntaxHighlighterHeadContent =
        syntaxHighlighter !== null && syntaxHighlighter.hasDocinfo('head')
          ? await syntaxHighlighter.docinfo('head', node, {})
          : ''
      const syntaxHighlighterFooterContent =
        syntaxHighlighter !== null && syntaxHighlighter.hasDocinfo('footer')
          ? await syntaxHighlighter.docinfo('footer', node, {})
          : ''
      const headerDocinfo = await node.getDocinfo('header')
      const footerDocinfo = await node.getDocinfo('footer')
      const docinfo = await node.getDocinfo()
      const content = await node.getContent()
      // Context consumed by the `webview/context` menu contribution (see
      // package.json) and by the export commands to target the previewed
      // document. `preventDefaultContextMenuItems` suppresses VS Code's native
      // Cut/Copy/Paste entries: Cut and Paste are meaningless in a read-only
      // preview, and copying is still available through Ctrl/Cmd+C. VS Code
      // offers no way to keep only Copy (microsoft/vscode#165679, closed as
      // not planned), so the whole native menu is dropped in favour of our
      // export-only menu.
      const vscodeContext = escapeAttribute(
        JSON.stringify({
          webviewSection: 'asciidoc-preview',
          preventDefaultContextMenuItems: true,
        }),
      )
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
        ${this.getStyles(node, webviewResourceProvider, this.textDocument.uri, this.config, this.state)}
        ${syntaxHighlighterHeadContent}
        ${docinfo}
        <base href="${webviewResourceProvider.asWebviewUri(this.textDocument.uri)}">
      </head>
      <body${node.getId() ? ` id="${node.getId()}"` : ''} class="${this.getBodyCssClasses(node)}" data-vscode-context="${vscodeContext}">
        <div id="preview-root">
        ${headerDocinfo}
        ${await this.getDocumentHeader(node)}
        <div id="content"${this.antoraDocumentContext ? ' class="doc"' : ''}>
          ${content}
        </div>
        ${this.generateFootnotes(node)}
        ${this.generateFooter(node)}
        <div class="code-line data-line-${this.textDocument.lineCount}" data-line="${this.textDocument.lineCount}"></div>
        </div>
        ${this.getScripts(webviewResourceProvider, nonce)}
        ${syntaxHighlighterFooterContent}
        ${this.generateMathJax(node, webviewResourceProvider, nonce)}
        ${this.generateMermaid(webviewResourceProvider, nonce)}
        ${footerDocinfo}
      </body>
      </html>`
    }
    if (nodeName === 'inline_anchor') {
      if (node.type === 'link') {
        const href = isSchemeBlacklisted(node.target) ? '#' : node.target
        const id = node.hasAttribute('id') ? ` id="${node.id}"` : ''
        const role = node.hasAttribute('role')
          ? ` class="${node.getRole()}"`
          : ''
        const title = node.hasAttribute('title') ? ` title="${node.title}"` : ''
        return `<a href="${href}"${id}${role}${title} data-href="${href}">${node.text}</a>`
      }
      if (node.type === 'xref') {
        const attrs = []
        // On Antora pages, the target is a resource id (e.g.
        // `api:auth:page3.adoc#oauth`) that the base converter leaves untouched,
        // producing a broken link in the preview. Resolve it to the actual file
        // so the link navigates to the referenced page (and anchor).
        const href = this.resolveXrefHref(node.target)
        attrs.push(` href="${href}"`)

        if (node.hasAttribute('id')) {
          attrs.push(` id="${node.id}"`)
        }
        if (node.hasAttribute('role')) {
          attrs.push(` class="${node.getRole()}"`)
        }
        if (node.hasAttribute('title')) {
          attrs.push(` title="${node.title}"`)
        }

        attrs.push(` data-href="${href}"`)

        let text: string

        // explicit text overrides all other options
        if (typeof node.text === 'string') {
          text = node.text
        } else {
          // no explicit text
          const path = node.getAttribute('path')
          // cross reference points to a file, use the file name
          if (typeof path === 'string') {
            text = node.getAttribute('path')
          } else {
            // cross reference is an internal reference
            const refid = node.getAttribute('refid')
            const refsCatalog = node.getDocument().getRefs()

            // lookup reference by id
            const refNode = refsCatalog[refid]

            // set default value, for cases where we cannot refine
            // (e.g. no reference found by refid, found a bibref, etc)
            text = refid

            // reference was found for refid, try to refine text
            if (typeof refNode !== 'undefined') {
              // maybe the referred node has a reftext which should be used
              const xrefStyle = node.getAttribute('xrefstyle', undefined, true)
              const xrefText = await (refNode as any).xreftext(
                xrefStyle ?? null,
              )
              if (xrefText) {
                text = xrefText
              } else {
                // maybe the referred node has a reftext which should be used
                if (refNode.hasAttribute('reftext')) {
                  text = refNode.getReftext()
                  const xrefStyle = node.getAttribute('xrefstyle')
                  text = await (refNode as any).xreftext(xrefStyle ?? null)
                } else {
                  // fall back and try title
                  if (typeof refNode.getTitle === 'function') {
                    text = refNode.getTitle()
                  } else {
                    if (typeof refNode.text === 'string') {
                      text = refNode.text
                    }
                  }
                }
              }
            }
          }
        }
        return `<a${attrs.join('')}>${text}</a>`
      }
    }
    if (nodeName === 'image') {
      const nodeAttributes = node.getAttributes()
      const target = nodeAttributes.target
      const resourceUri = this.antoraDocumentContext?.resolveAntoraResourceIds(
        target,
        'image',
      )
      if (resourceUri !== undefined) {
        const alt = resourceUri.split('/').pop().split('.').shift()
        node.setAttribute('target', resourceUri)
        node.setAttribute('alt', alt)
      } else if (this.dataUriEnabled) {
        // We embed images ourselves rather than relying on Asciidoctor's own
        // `data-uri` (disabled in the engine, see asciidocEngine.ts). Since
        // Asciidoctor.js 4.0 dropped Opal, the native path reads via
        // `node:fs`/`fetch` and would work on the desktop — but not in VS Code
        // for the Web (no `node:fs`) nor on virtual file systems (Remote SSH,
        // dev containers, `vscode-vfs:`), where only `vscode.workspace.fs` can
        // read the file. Going through the VS Code FS API (local) and `fetch`
        // (remote) embeds images uniformly across every host.
        const dataUri = await this.toImageDataUri(node, target)
        if (dataUri !== undefined) {
          node.setAttribute('target', dataUri)
        }
      }
    }
    return await this.baseConverter.convert(node, transform)
  }

  /**
   * Signal to Asciidoctor.js 4.0 that this converter can be composed with a
   * template converter. When `template_dirs` is set, the factory only builds the
   * `CompositeConverter([TemplateConverter, this])` — which lets user templates
   * override individual node transforms in the preview — if the backend
   * converter answers `true` here (see `@asciidoctor/core` converter.js). The
   * legacy `supports_templates` property is not consulted in 4.0.
   */
  hasSupportsTemplates(): boolean {
    return true
  }

  /**
   * In a `CompositeConverter`, each transform is routed to the first converter
   * whose `handles()` returns `true`. The template converter is tried first and
   * only claims the transforms it has a template for; this converter is the
   * fallback and handles everything else, so it always returns `true`.
   */
  handles(): boolean {
    return true
  }

  /**
   * Backend traits the `CompositeConverter` copies from its delegate to expose
   * `outfilesuffix`/`filetype`/… to the document. Kept in sync with the string
   * properties set in the constructor.
   */
  backendInfo(): {
    basebackend: string
    outfilesuffix: string
    filetype: string
    htmlsyntax: string
  } {
    return {
      basebackend: this.basebackend,
      outfilesuffix: this.outfilesuffix,
      filetype: 'html',
      htmlsyntax: 'html',
    }
  }

  /**
   * Build a `data:` URI for an image target, mirroring Asciidoctor's `data-uri`
   * attribute. Returns undefined when the image cannot be read so the base
   * converter falls back to rendering the original (linked) target.
   */
  private async toImageDataUri(
    node,
    target: string,
  ): Promise<string | undefined> {
    if (typeof target !== 'string' || target.startsWith('data:')) {
      return undefined
    }
    try {
      let bytes: Uint8Array
      let mimeType: string
      if (/^https?:\/\//i.test(target)) {
        const response = await fetch(target)
        if (!response.ok) {
          return undefined
        }
        bytes = new Uint8Array(await response.arrayBuffer())
        mimeType =
          response.headers.get('content-type')?.split(';')[0].trim() ||
          mimeTypeForTarget(target)
      } else {
        const fileUri = this.resolveImageUri(node, target)
        bytes = await vscode.workspace.fs.readFile(fileUri)
        mimeType = mimeTypeForTarget(target)
      }
      return `data:${mimeType};base64,${encodeBase64(bytes)}`
    } catch (e) {
      logger.warn(`Unable to embed image "${target}" as data-uri: ${e}`)
      return undefined
    }
  }

  /**
   * Resolve a local image target to a filesystem URI, honouring `imagesdir` and
   * resolving relative paths against the AsciiDoc document's directory.
   *
   * `imagesdir` is read from the image *node*, not the document: Asciidoctor
   * captures the value in effect at each image's position during parsing, so
   * this stays correct when `:imagesdir:` is redefined in the document body
   * (`document.getAttribute('imagesdir')` would only report the header value).
   */
  private resolveImageUri(node, target: string): vscode.Uri {
    if (target.startsWith('/') || /^[a-z]:[\\/]/i.test(target)) {
      return vscode.Uri.file(target)
    }
    const imagesdir = node.getAttribute('imagesdir', '') || ''
    const relativePath = imagesdir ? `${imagesdir}/${target}` : target
    const segments = relativePath.split('/').filter((s) => s.length > 0)
    return vscode.Uri.joinPath(
      uri.Utils.dirname(this.textDocument.uri),
      ...segments,
    )
  }

  /**
   * Resolve an `xref:` target to a link that works inside the preview. On Antora
   * pages the target is a resource id (e.g. `api:auth:page3.adoc#oauth`); resolve
   * the page part to its file path so clicking the link opens the referenced page
   * at the right anchor. Targets that are not Antora resource ids (plain relative
   * paths, internal anchors) are returned unchanged.
   */
  private resolveXrefHref(target: string): string {
    if (
      this.antoraDocumentContext === undefined ||
      typeof target !== 'string'
    ) {
      return target
    }
    const hashIndex = target.indexOf('#')
    const id = hashIndex === -1 ? target : target.slice(0, hashIndex)
    const fragment = hashIndex === -1 ? '' : target.slice(hashIndex)
    if (id.length === 0) {
      return target
    }
    const resourcePath = this.antoraDocumentContext.resolveAntoraResourceIds(
      id,
      'page',
    )
    if (resourcePath === undefined) {
      return target
    }
    return `${resourcePath}${fragment}`
  }

  private generateMathJax(node, webviewResourceProvider, nonce) {
    // `fontBase` serves the CommonHTML font from the bundled copy instead of the
    // jsdelivr CDN the component defaults to (the WebView is offline and the CDN
    // is blocked by the Content-Security-Policy). The `%%FONT%%` placeholder is
    // appended by renderMathJax, so it is not routed through asMediaWebViewSrc
    // (which would URL-encode it).
    return renderMathJax(
      node.isAttribute('stem'),
      node.getAttribute('eqnums', 'none'),
      nonce,
      {
        scriptSrc: webviewResourceProvider.asMediaWebViewSrc(
          'media',
          'mathjax',
          'tex-mml-chtml-mathjax-newcm.js',
        ),
        fontBase: webviewResourceProvider.asMediaWebViewSrc(
          'media',
          'mathjax',
          'output',
          'fonts',
        ),
      },
    )
  }

  private generateFootnotes(node) {
    if (node.hasFootnotes() && !node.isAttribute('nofootnotes')) {
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

  private generateMermaid(webviewResourceProvider, nonce) {
    const mermaidSrc = webviewResourceProvider.asMediaWebViewSrc(
      'media',
      'mermaid',
      'dist',
      'mermaid.esm.min.mjs',
    )
    const elkLayoutSrc = webviewResourceProvider.asMediaWebViewSrc(
      'media',
      '@mermaid-js',
      'layout-elk',
      'dist',
      'mermaid-layout-elk.esm.min.mjs',
    )
    const zenumlSrc = webviewResourceProvider.asMediaWebViewSrc(
      'media',
      '@mermaid-js',
      'mermaid-zenuml',
      'dist',
      'mermaid-zenuml.esm.min.mjs',
    )
    // Core Mermaid diagrams ship in mermaid.esm.min.mjs, but a few render paths
    // live in separate packages that must be registered before mermaid runs:
    //   - the ELK layout engine (`layout: elk`) via registerLayoutLoaders
    //   - the ZenUML diagram (`zenuml`) via registerExternalDiagrams
    // We disable startOnLoad and call run() ourselves so the registrations are
    // guaranteed to complete before any diagram is detected and rendered.
    return `<!--suppress JSAnnotator -->
<script type="module" nonce="${nonce}">
    import mermaid from '${mermaidSrc}';
    import elkLayouts from '${elkLayoutSrc}';
    import zenuml from '${zenumlSrc}';
    const dark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
    mermaid.registerLayoutLoaders(elkLayouts);
    await mermaid.registerExternalDiagrams([zenuml]);
    mermaid.initialize({startOnLoad: false, theme: dark ? 'dark' : 'default'});
    // Expose a re-render hook so incremental preview updates can render only the
    // Mermaid diagrams that were added or changed (run() skips already-processed
    // nodes), instead of reloading the whole webview.
    window.__asciidocRenderMermaid = async (nodes) => {
      try {
        await mermaid.run(nodes && nodes.length ? { nodes } : undefined);
      } catch (e) {
        console.error('Mermaid rendering failed', e);
      }
    };
    await window.__asciidocRenderMermaid();
  </script>`
  }

  private generateFooter(node) {
    if (node.getNofooter()) {
      return ''
    }
    const footerInfos = []
    if (node.isAttribute('revnumber')) {
      footerInfos.push(
        `${node.getAttribute('version-label')} ${node.getAttribute('revnumber')}<br/>`,
      )
    }
    const reproducible = node.isAttribute('reproducible')
    if (node.isAttribute('last-update-label') && !reproducible) {
      footerInfos.push(
        `${node.getAttribute('last-update-label')} ${node.getAttribute('docdatetime')}`,
      )
    }
    return `<div id="footer">
<div id="footer-text">
${footerInfos.join('\n')}
</div>
</div>`
  }

  private async getDocumentHeader(node) {
    if (node.getNoheader()) {
      return ''
    }
    const maxWidthAttr = node.hasAttribute('max-width')
      ? ` style="max-width: ${node.getAttribute('max-width')};"`
      : ''
    const doctype = node.getDoctype()
    const headerContent =
      doctype === 'manpage'
        ? await this.generateManPageHeader(node)
        : await this.generateArticleHeader(node)
    return `<div id="header"${maxWidthAttr}>
${headerContent}
</div>`
  }

  private async generateArticleHeader(node) {
    const content = []
    if (node.hasHeader()) {
      if (!node.getNotitle()) {
        const doctitle = node.getDoctitle({ partition: true, sanitize: true })
        content.push(
          `<h1>${doctitle.getMain()}${doctitle.hasSubtitle() ? ` <small class="subtitle">${doctitle.getSubtitle()}</small>` : ''}</h1>`,
        )
      }
      const details = await this.generateHeaderDetails(node)
      if (details) {
        content.push(details)
      }
    }
    if (
      node.hasSections() &&
      node.hasAttribute('toc') &&
      node.isAttribute('toc-placement', 'auto')
    ) {
      const outline = await node.getConverter().convert(node, 'outline')
      content.push(`<div id="toc" class="${node.getAttribute('toc-class', 'toc')}">
  <div id="toctitle">${node.getAttribute('toc-title')}</div>
  ${outline}
</div>`)
    }
    return content.join('\n')
  }

  private async generateHeaderDetails(node) {
    const details = []
    const authors = node.getAuthors()
    for (let idx = 0; idx < authors.length; idx++) {
      const author = authors[idx]
      details.push(
        `<span id="author${idx > 0 ? idx + 1 : ''}" class="author">${(node as any).subReplacements(author.getName())}</span><br/>`,
      )
      const authorEmail = author.getEmail()
      if (authorEmail) {
        // `subMacros` is declared to return a string but actually resolves a
        // Promise in Asciidoctor.js 4.0, so it must be awaited.
        const email = await (node as any).subMacros(authorEmail)
        details.push(
          `<span id="email${idx > 0 ? idx + 1 : ''}" class="email">${email}</span><br/>`,
        )
      }
    }
    if (node.hasAttribute('revnumber')) {
      const versionLabel = (
        node.getAttribute('version-label') || ''
      ).toLowerCase()
      details.push(
        `<span id="revnumber">${versionLabel} ${node.getAttribute('revnumber')}${node.hasAttribute('revdate') ? ',' : ''}</span>`,
      )
    }
    if (node.hasAttribute('revdate')) {
      details.push(`<span id="revdate">${node.getAttribute('revdate')}</span>`)
    }
    if (node.hasAttribute('revremark')) {
      details.push(
        `<span id="revremark">${node.getAttribute('revremark')}</span>`,
      )
    }
    if (details.length > 0) {
      return `<div class="details">
${details.join('\n')}
</div>`
    }
    return ''
  }

  private async generateManPageHeader(node) {
    let tocContent = ''
    if (
      node.hasSections() &&
      node.hasAttribute('toc') &&
      node.hasAttribute('toc-placement', 'auto')
    ) {
      const outline = await node.getConverter().convert(node, 'outline')
      tocContent = `<div id="toc" class="${node.getAttribute('toc-class', 'toc')}">
<div id="toctitle">${node.getAttribute('toc-title')}</div>
${outline}
</div>`
    }
    return `<h1>${node.getDoctitle()} Manual Page</h1>
${tocContent}
${node.hasAttribute('manpurpose') ? this.generateManNameSection(node) : ''}`
  }

  private generateManNameSection(node) {
    let mannameTitle = node.getAttribute('manname-title', 'Name')
    const nextSection = node.getSections()[0]
    if (
      nextSection &&
      nextSection.getTitle() === nextSection.getTitle().toUpperCase()
    ) {
      mannameTitle = mannameTitle.toUpperCase()
    }
    const mannameIdAttr = node.getAttribute('manname-id')
      ? ` id="${node.getAttribute('manname-id')}"`
      : ''
    return `<h2${mannameIdAttr}>${mannameTitle}</h2>
  <div class="sectionbody">
    <p>${node.getAttribute('mannames').join(', ')} - ${node.getAttribute('manpurpose')}</p>
  </div>`
  }

  private getBodyCssClasses(node) {
    const classes = [
      'vscode-body',
      this.config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : undefined,
      this.config.wordWrap ? 'wordWrap' : undefined,
      this.config.markEditorSelection ? 'showEditorSelection' : undefined,
    ]
    const sectioned = node.hasSections()
    if (
      sectioned &&
      node.isAttribute('toc-class') &&
      node.isAttribute('toc') &&
      node.isAttribute('toc-placement', 'auto')
    ) {
      classes.push(
        node.getDoctype(),
        node.getAttribute('toc-class'),
        `toc-${node.getAttribute('toc-position', 'header')}`,
      )
    } else {
      classes.push(node.getDoctype())
    }
    if (node.hasRoleAttribute()) {
      classes.push(node.getRole())
    }
    return classes.filter((cssClass) => cssClass !== undefined).join(' ')
  }

  private getSettingsOverrideStyles(
    config: AsciidocPreviewConfiguration,
  ): string {
    return [
      config.fontFamily ? `--asciidoc-font-family: ${config.fontFamily};` : '',
      isNaN(config.fontSize)
        ? ''
        : `--asciidoc-font-size: ${config.fontSize}px;`,
      isNaN(config.lineHeight)
        ? ''
        : `--asciidoc-line-height: ${config.lineHeight};`,
    ].join(' ')
  }

  private extensionResourcePath(mediaFile: string): string {
    return this.webviewResourceProvider.asMediaWebViewSrc('dist', mediaFile)
  }

  private getStyles(
    node: AsciidoctorDocument,
    webviewResourceProvider: WebviewResourceProvider,
    textDocumentUri: vscode.Uri,
    config: AsciidocPreviewConfiguration,
    state?: any,
  ): string {
    const baseStyles: string[] = []
    for (const previewStyle of this.contributions.previewStyles) {
      baseStyles.push(
        `<link rel="stylesheet" type="text/css" href="${escapeAttribute(webviewResourceProvider.asWebviewUri(previewStyle))}">`,
      )
    }
    // A "replacement" stylesheet supplants Asciidoctor's default one. It can
    // come from the `asciidoc.preview.style` setting or, as a fallback when that
    // setting is empty, from the document's own `stylesheet`/`stylesdir`
    // attributes (like Asciidoctor's HTML output). The setting wins so an
    // explicit user override still takes precedence over the document.
    const replacementStyle =
      config.previewStyle !== ''
        ? config.previewStyle
        : this.resolveDocumentStylesheet(node)
    if (replacementStyle === '') {
      const builtinStylesheet = config.useEditorStylesheet
        ? 'asciidoctor-editor.css'
        : 'asciidoctor-default.css'
      baseStyles.push(
        `<link rel="stylesheet" type="text/css" href="${webviewResourceProvider.asMediaWebViewSrc('media', builtinStylesheet)}">`,
      )
      if (config.useEditorStylesheet) {
        // Theme-integrated refinements layered on top of the editor stylesheet.
        baseStyles.push(
          `<link rel="stylesheet" type="text/css" href="${webviewResourceProvider.asMediaWebViewSrc('media', 'asciidoctor-editor-enhancements.css')}">`,
        )
      }
    }
    if (node.isAttribute('icons', 'font')) {
      baseStyles.push(
        `<link rel="stylesheet" href="${webviewResourceProvider.asMediaWebViewSrc('media', 'font-awesome', 'css', 'font-awesome.css')}">`,
      )
    }
    return `${baseStyles.join('\n')}
  ${this.computeCustomStyleSheetIncludes(webviewResourceProvider, textDocumentUri, replacementStyle, config.additionalStyles)}
  ${this.getScrollBeyondLastLineStyles()}
  ${this.getImageStabilizerStyles(state)}`
  }

  /**
   * Resolve the `stylesheet` (and `stylesdir`) document attributes to a path
   * that {@link fixHref} can turn into a webview `href`, mirroring Asciidoctor's
   * own resolution: a `stylesheet` that is a URI or an absolute path is used
   * verbatim (and `stylesdir` is ignored), otherwise it is looked up under
   * `stylesdir` relative to the document's `base_dir`. Returns '' when no
   * `stylesheet` attribute is set.
   *
   * Resolving against `node.getBaseDir()` (rather than the document's own
   * directory) keeps the preview aligned with Asciidoctor: by default the base
   * dir is the document directory, but when
   * `asciidoc.useWorkspaceRootAsBaseDirectory` is enabled it is the workspace
   * root, and a relative `stylesheet` follows suit — exactly as it would in the
   * generated HTML.
   *
   * Only consulted as a fallback when the `asciidoc.preview.style` setting is
   * empty, so an explicit user setting still wins.
   */
  private resolveDocumentStylesheet(node: AsciidoctorDocument): string {
    const stylesheet = node.getAttribute('stylesheet')
    if (!stylesheet) {
      return ''
    }
    const isUri = (value: string): boolean =>
      /^(https?|file):/.test(value) ||
      value.startsWith('/') ||
      /^[a-z]:\\/i.test(value)
    // An absolute or URI `stylesheet` ignores `stylesdir`, like Asciidoctor.
    if (isUri(stylesheet)) {
      return stylesheet
    }
    const stylesdir = node.getAttribute('stylesdir', '')
    const combined =
      stylesdir && stylesdir !== '.'
        ? `${stylesdir.replace(/\/+$/, '')}/${stylesheet}`
        : stylesheet
    // `stylesdir` may itself be a URL or absolute base directory.
    if (isUri(combined)) {
      return combined
    }
    // Resolve against Asciidoctor's effective base dir, then let `fixHref` map
    // the absolute path to a webview URI.
    const baseDir = node.getBaseDir()
    const baseUri = baseDir
      ? vscode.Uri.file(baseDir)
      : uri.Utils.dirname(this.textDocument.uri)
    return uri.Utils.joinPath(baseUri, combined).fsPath
  }

  private getScripts(
    webviewResourceProvider: WebviewResourceProvider,
    nonce: string,
  ): string {
    const out: string[] = []
    for (const previewScript of this.contributions.previewScripts) {
      out.push(
        `<script async src="${escapeAttribute(webviewResourceProvider.asWebviewUri(previewScript))}" nonce="${nonce}" charset="UTF-8"></script>`,
      )
    }
    return out.join('\n')
  }

  private computeCustomStyleSheetIncludes(
    webviewResourceProvider: WebviewResourceProvider,
    textDocumentUri: vscode.Uri,
    replacementStyle: string,
    additionalStyles: readonly string[],
  ): string {
    return buildCustomStyleSheetLinks(
      replacementStyle,
      additionalStyles,
      (stylePath) =>
        this.fixHref(webviewResourceProvider, textDocumentUri, stylePath),
    )
  }

  // Mirror the editor's `scrollBeyondLastLine`: reserve a viewport's worth of
  // empty space below the content so the last lines can be scrolled up to the
  // top of the preview, like the editor lets you scroll past its last line.
  // This also makes the bottom of both panes line up naturally.
  private getScrollBeyondLastLineStyles() {
    if (!this.config.scrollBeyondLastLine) {
      return ''
    }
    return `<style>
#preview-root { padding-bottom: calc(100vh - 4rem); }
</style>\n`
  }

  private getImageStabilizerStyles(state?: any) {
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

  private fixHref(
    webviewResourceProvider: WebviewResourceProvider,
    textDocumentUri: vscode.Uri,
    href: string,
  ): string {
    // QUESTION: should we use `stylesdir` attribute in here?
    if (!href) {
      return href
    }

    if (
      href.startsWith('http:') ||
      href.startsWith('https:') ||
      href.startsWith('file:')
    ) {
      return href
    }

    // Assume it must be a local file
    if (href.startsWith('/') || /^[a-z]:\\/i.test(href)) {
      return webviewResourceProvider
        .asWebviewUri(vscode.Uri.file(href))
        .toString()
    }

    // Use a workspace relative path if there is a workspace
    const root = getWorkspaceFolder(textDocumentUri)
    if (root) {
      return webviewResourceProvider
        .asWebviewUri(vscode.Uri.joinPath(root.uri, href))
        .toString()
    }

    // Otherwise look relative to the AsciiDoc file
    return webviewResourceProvider
      .asWebviewUri(
        vscode.Uri.joinPath(uri.Utils.dirname(textDocumentUri), href),
      )
      .toString()
  }
}
