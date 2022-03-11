/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { Webview } from 'vscode'
import * as path from 'path'
import { AsciidocEngine } from '../asciidocEngine'

import * as nls from 'vscode-nls'

import { Logger } from '../logger'
import { AsciidocPreviewSecurityLevel, ContentSecurityPolicyArbiter } from '../security'
import { AsciidocPreviewConfiguration, AsciidocPreviewConfigurationManager } from './previewConfig'
import { AsciidocContributions } from '../asciidocExtensions'

const localize = nls.loadMessageBundle()

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

export class AsciidocContentProvider {
  constructor (
    private readonly engine: AsciidocEngine,
    private readonly context: vscode.ExtensionContext,
    private readonly cspArbiter: ContentSecurityPolicyArbiter,
    private readonly contributions: AsciidocContributions,
    private readonly logger: Logger) {
    this.engine = engine
    this.context = context
    this.cspArbiter = cspArbiter
    this.contributions = contributions
    this.logger = logger
  }

  public async providePreviewHTML (
    asciidocDocument: vscode.TextDocument,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    initialLine: number | undefined = undefined,
    state?: any,
    editor?: vscode.WebviewPanel
  ): Promise<string> {
    const sourceUri = asciidocDocument.uri
    const config = previewConfigurations.loadAndCacheConfiguration(sourceUri)
    const initialData = {
      source: sourceUri.toString(),
      line: initialLine,
      lineCount: asciidocDocument.lineCount,
      scrollPreviewWithEditor: config.scrollPreviewWithEditor,
      scrollEditorWithPreview: config.scrollEditorWithPreview,
      doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
      disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings(),
    }

    // Content Security Policy
    const nonce = new Date().getTime() + '' + new Date().getMilliseconds()
    const csp = this.getCspForResource(sourceUri, nonce)
    const { output: body } = await this.engine.convert(sourceUri, config.previewFrontMatter === 'hide', asciidocDocument.getText(), this.context, editor)
    const bodyClassesRegex = /<body(?:(?:\s+(?:id=".*"\s*)?class(?:\s*=\s*(?:"(.+?)"|'(.+?)')))+\s*)>/
    const bodyClasses = body.match(bodyClassesRegex)
    const bodyClassesVal = bodyClasses === null ? '' : bodyClasses[1]
    this.logger.log(`Using CSS ${this.getStyles(sourceUri, nonce, config, state)}`)

    return `<!DOCTYPE html>
      <html style="${escapeAttribute(this.getSettingsOverrideStyles(config))}">
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
        ${csp}
        <meta id="vscode-asciidoc-preview-data"
          data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}"
          data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}"
          data-state="${JSON.stringify(state || {}).replace(/"/g, '&quot;')}">
        <script src="${this.extensionResourcePath(editor.webview, 'pre.js')}" nonce="${nonce}"></script>
        ${this.getStyles(sourceUri, nonce, config, state)}
        <base href="${editor.webview.asWebviewUri(asciidocDocument.uri).toString(true)}">
      </head>
      <body class="${bodyClassesVal} vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
        ${body}
        <div class="code-line" data-line="${asciidocDocument.lineCount}"></div>
        <script async src="${this.extensionResourcePath(editor.webview, 'index.js')}" nonce="${nonce}" charset="UTF-8"></script>
      </body>
      </html>`
  }

  private extensionResourcePath (webview: Webview, mediaFile: string): string {
    const webviewResource = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', mediaFile))
    return webviewResource.toString()
  }

  private fixHref (resource: vscode.Uri, href: string): string {
    if (!href) {
      return href
    }

    // Use href if it is already an URL
    const hrefUri = vscode.Uri.parse(href)
    if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
      return hrefUri.toString()
    }

    // Use href as file URI if it is absolute
    if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
      return vscode.Uri.file(href)
        .with({ scheme: 'vscode-resource' })
        .toString()
    }

    // Use a workspace relative path if there is a workspace
    const root = vscode.workspace.getWorkspaceFolder(resource)
    if (root) {
      return vscode.Uri.file(path.join(root.uri.fsPath, href))
        .with({ scheme: 'vscode-resource' })
        .toString()
    }

    // Otherwise look relative to the asciidoc file
    return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href))
      .with({ scheme: 'vscode-resource' })
      .toString()
  }

  private computeCustomStyleSheetIncludes (resource: vscode.Uri, config: AsciidocPreviewConfiguration): string {
    if (Array.isArray(config.styles)) {
      return config.styles.map((style) => {
        return `<link rel="stylesheet" class="code-user-style" data-source="${style.replace(/"/g, '&quot;')}" href="${this.fixHref(resource, style)}" type="text/css" media="screen">`
      }).join('\n')
    }
    return ''
  }

  private getSettingsOverrideStyles (config: AsciidocPreviewConfiguration): string {
    return [
      config.fontFamily ? `--asciidoc-font-family: ${config.fontFamily};` : '',
      isNaN(config.fontSize) ? '' : `--asciidoc-font-size: ${config.fontSize}px;`,
      isNaN(config.lineHeight) ? '' : `--asciidoc-line-height: ${config.lineHeight};`,
    ].join(' ')
  }

  private getImageStabilizerStyles (state?: any) {
    let ret = '<style>\n'
    if (state && state.imageInfo) {
      state.imageInfo.forEach((imgInfo: any) => {
        ret += `#${imgInfo.id}.loading {
          height: ${imgInfo.height}px;
          width: ${imgInfo.width}px;
        }\n`
      })
    }
    ret += '</style>\n'

    return ret
  }

  private getStyles (resource: vscode.Uri, nonce: string, config: AsciidocPreviewConfiguration, state?: any): string {
    const useEditorStyle = vscode.workspace.getConfiguration('asciidoc', null).get('preview.useEditorStyle')
    let baseStyles
    if (useEditorStyle) {
      baseStyles = this.contributions.previewStylesEditor
        .map((resource) => `<link rel="stylesheet" type="text/css" href="${resource.toString()}">`)
        .join('\n')
    } else {
      baseStyles = this.contributions.previewStylesDefault
        .map((resource) => `<link rel="stylesheet" type="text/css" href="${resource.toString()}">`)
        .join('\n')
    }

    return `${baseStyles}
      ${this.computeCustomStyleSheetIncludes(resource, config)}
      ${this.getImageStabilizerStyles(state)}`
  }

  private getCspForResource (resource: vscode.Uri, nonce: string): string {
    const highlightjsInlineScriptHash = 'sha256-ZrDBcrmObbqhVV/Mag2fT/y08UJGejdW7UWyEsi4DXw='
    switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
      case AsciidocPreviewSecurityLevel.AllowInsecureContent:
        return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: http: https: data:; media-src vscode-resource: http: https: data:; script-src vscode-resource: 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src vscode-resource: 'unsafe-inline' http: https: data:; font-src vscode-resource: http: https: data:;">`

      case AsciidocPreviewSecurityLevel.AllowInsecureLocalContent:
        return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*; media-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*; script-src vscode-resource: 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src vscode-resource: 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*;">`

      case AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent:
        return ''

      case AsciidocPreviewSecurityLevel.Strict:
      default:
        return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; media-src vscode-resource: https: data:; script-src vscode-resource: 'nonce-${nonce}' '${highlightjsInlineScriptHash}'; style-src vscode-resource: 'unsafe-inline' https: data:; font-src vscode-resource: https: data:;">`
    }
  }
}

function escapeAttribute (value: string | vscode.Uri): string {
  return value.toString().replace(/"/g, '&quot;')
}
