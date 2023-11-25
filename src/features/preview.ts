/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import * as uri from 'vscode-uri'
import * as path from 'path'

import { Logger } from '../logger'
import { AsciidocContentProvider } from './previewContentProvider'
import { disposeAll, Disposable } from '../util/dispose'
import { WebviewResourceProvider } from '../util/resources'
import { AsciidocFileTopmostLineMonitor, getVisibleLine } from '../util/topmostLineMonitor'
import { AsciidocPreviewConfiguration, AsciidocPreviewConfigurationManager } from './previewConfig'
import { AsciidocContributionProvider } from '../asciidocExtensions'
import { isAsciidocFile } from '../util/file'
import { resolveLinkToAsciidocFile } from '../commands/openDocumentLink'
import * as nls from 'vscode-nls'
import { getWorkspaceFolder, getWorkspaceFolders } from '../util/workspace'

const localize = nls.loadMessageBundle()

export class AsciidocPreview extends Disposable implements WebviewResourceProvider {
  public static viewType = 'asciidoc.preview'

  private _resource: vscode.Uri
  private _resourceColumn: vscode.ViewColumn
  private _locked: boolean

  private readonly editor: vscode.WebviewPanel
  private throttleTimer: any
  private line: number | undefined = undefined
  private readonly disposables: vscode.Disposable[] = []
  private firstUpdate = true
  private currentVersion?: { resource: vscode.Uri, version: number }
  private forceUpdate = false
  private isScrolling = false
  private _disposed: boolean = false
  private imageInfo: { id: string, width: number, height: number }[] = []
  private config: vscode.WorkspaceConfiguration
  private refreshInterval: number

  public static async revive (
    webview: vscode.WebviewPanel,
    state: any,
    contentProvider: AsciidocContentProvider,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    contributionProvider: AsciidocContributionProvider
  ): Promise<AsciidocPreview> {
    const resource = vscode.Uri.parse(state.source)
    const locked = state.locked || false
    const line = state.line

    const preview = new AsciidocPreview(
      webview,
      resource,
      locked,
      contentProvider,
      previewConfigurations,
      logger,
      topmostLineMonitor,
      contributionProvider)

    preview.editor.webview.options = AsciidocPreview.getWebviewOptions(resource, contributionProvider, previewConfigurations.loadAndCacheConfiguration(resource))

    if (!isNaN(line)) {
      preview.line = line
    }
    await preview.doUpdate()
    return preview
  }

  public static create (
    resource: vscode.Uri,
    resourceColumn: vscode.ViewColumn,
    previewColumn: vscode.ViewColumn,
    locked: boolean,
    contentProvider: AsciidocContentProvider,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    contributionProvider: AsciidocContributionProvider
  ): AsciidocPreview {
    const retainContextWhenHidden = vscode.workspace
      .getConfiguration('asciidoc', null)
      .get<boolean>('preview.preservePreviewWhenHidden', false)

    const webview = vscode.window.createWebviewPanel(
      AsciidocPreview.viewType,
      AsciidocPreview.getPreviewTitle(resource, locked),
      previewColumn,
      {
        enableFindWidget: true,
        retainContextWhenHidden,
        ...AsciidocPreview.getWebviewOptions(resource, contributionProvider, previewConfigurations.loadAndCacheConfiguration(resource)),
      }
    )

    return new AsciidocPreview(
      webview,
      resource,
      locked,
      contentProvider,
      previewConfigurations,
      logger,
      topmostLineMonitor,
      contributionProvider)
  }

  private constructor (
    webview: vscode.WebviewPanel,
    resource: vscode.Uri,
    locked: boolean,
    private readonly _contentProvider: AsciidocContentProvider,
    private readonly _previewConfigurations: AsciidocPreviewConfigurationManager,
    private readonly _logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    private readonly _contributionProvider: AsciidocContributionProvider
  ) {
    super()
    this._resource = resource

    this._locked = locked
    this.editor = webview
    this.config = vscode.workspace.getConfiguration('asciidoc', this.resource)
    this.refreshInterval = this.config.get<number>('preview.refreshInterval')

    this.editor.onDidDispose(() => {
      this.dispose()
    }, null, this.disposables)

    this.editor.onDidChangeViewState((e) => {
      this._onDidChangeViewStateEmitter.fire(e)
    }, null, this.disposables)

    this.editor.webview.onDidReceiveMessage((e) => {
      if (e.source !== this._resource.toString()) {
        return
      }

      switch (e.type) {
        case 'cacheImageSizes':
          this.onCacheImageSizes(e.body)
          break

        case 'revealLine':
          this.onDidScrollPreview(e.body.line)
          break

        case 'clickLink':
          this.onDidClickPreviewLink(e.body.href)
          break

        case 'showPreviewSecuritySelector':
          vscode.commands.executeCommand('asciidoc.showPreviewSecuritySelector', e.body.source)
          break

        case 'previewStyleLoadError':
          vscode.window.showWarningMessage(localize('preview.styleLoadError.message', "Could not load 'asciidoc.styles': {0}", e.body.unloadedStyles.join(', ')))
          break
      }
    }, null, this.disposables)

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (this.isPreviewOf(event.document.uri)) {
        this.refresh()
      }
    }, null, this.disposables)

    topmostLineMonitor.onDidChangeTopmostLine((event) => {
      if (this.isPreviewOf(event.resource)) {
        this.updateForView(event.resource, event.line)
      }
    }, null, this.disposables)

    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (this.isPreviewOf(event.textEditor.document.uri)) {
        const line = event.selections[0].active.line
        this.line = line

        this.postMessage({
          type: 'onDidChangeTextEditorSelection',
          line,
          source: this.resource.toString(),
        })
      }
    }, null, this.disposables)

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isAsciidocFile(editor.document) && !this._locked) {
        this.update(editor.document.uri)
      }
    }, null, this.disposables)
  }

  private readonly _onDisposeEmitter = new vscode.EventEmitter<void>()
  public readonly onDispose = this._onDisposeEmitter.event

  private readonly _onDidChangeViewStateEmitter = new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>()
  public readonly onDidChangeViewState = this._onDidChangeViewStateEmitter.event

  public get resource (): vscode.Uri {
    return this._resource
  }

  public get resourceColumn (): vscode.ViewColumn {
    return this._resourceColumn || vscode.ViewColumn.One
  }

  public get state () {
    return {
      resource: this._resource.toString(),
      locked: this._locked,
      line: this.line,
      imageInfo: this.imageInfo,
    }
  }

  override dispose () {
    super.dispose()

    this._disposed = true
    this._onDisposeEmitter.fire()

    this._onDisposeEmitter.dispose()
    this._onDidChangeViewStateEmitter.dispose()
    this.editor.dispose()

    disposeAll(this.disposables)
  }

  // This method is invoked evrytime there is a document update
  public update (resource: vscode.Uri) {
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.uri.fsPath === resource.fsPath) {
      this.line = getVisibleLine(editor)
    }

    // If we have changed resources, cancel any pending updates
    const isResourceChange = resource.fsPath !== this._resource.fsPath
    if (isResourceChange) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = undefined
    }

    this._resource = resource

    // Schedule update if none is pending
    if (!this.throttleTimer) {
      if (isResourceChange || this.firstUpdate || this.forceUpdate) {
        this.doUpdate()
      } else {
        if (this.refreshInterval > 0) { this.throttleTimer = setTimeout(() => this.doUpdate(), this.refreshInterval) }
      }
    }

    this.firstUpdate = false
  }

  public refresh (forceUpdate: boolean = false) {
    this.forceUpdate = forceUpdate
    this.update(this._resource)
  }

  public updateConfiguration () {
    if (this._previewConfigurations.hasConfigurationChanged(this._resource)) {
      this.config = vscode.workspace.getConfiguration('asciidoc', this.resource)
      this.refreshInterval = this.config.get<number>('preview.refreshInterval')
      this.refresh()
    }
  }

  public get position (): vscode.ViewColumn | undefined {
    return this.editor.viewColumn
  }

  public matchesResource (
    otherResource: vscode.Uri,
    otherPosition: vscode.ViewColumn | undefined,
    otherLocked: boolean
  ): boolean {
    if (this.position !== otherPosition) {
      return false
    }

    if (this._locked) {
      return otherLocked && this.isPreviewOf(otherResource)
    } else {
      return !otherLocked
    }
  }

  public matches (otherPreview: AsciidocPreview): boolean {
    return this.matchesResource(otherPreview._resource, otherPreview.position, otherPreview._locked)
  }

  public reveal (viewColumn: vscode.ViewColumn) {
    this.editor.reveal(viewColumn)
  }

  public toggleLock () {
    this._locked = !this._locked
    this.editor.title = AsciidocPreview.getPreviewTitle(this._resource, this._locked)
  }

  private get iconPath () {
    const root = vscode.Uri.joinPath(this._contributionProvider.extensionUri, 'media')
    return {
      light: vscode.Uri.joinPath(root, 'preview-light.svg'),
      dark: vscode.Uri.joinPath(root, 'preview-dark.svg'),
    }
  }

  private isPreviewOf (resource: vscode.Uri): boolean {
    return this._resource.fsPath === resource.fsPath
  }

  private static getPreviewTitle (resource: vscode.Uri, locked: boolean): string {
    return locked
      ? localize('preview.locked.title', '[Preview] {0}', path.basename(resource.fsPath))
      : localize('preview.unlocked.title', 'Preview {0}', path.basename(resource.fsPath))
  }

  private updateForView (resource: vscode.Uri, topLine: number | undefined) {
    if (!this.isPreviewOf(resource)) {
      return
    }

    if (this.isScrolling) {
      this.isScrolling = false
      return
    }

    if (typeof topLine === 'number') {
      this.line = topLine
      this.postMessage({
        type: 'updateView',
        line: topLine,
        source: resource.toString(),
      })
    }
  }

  private postMessage (msg: any) {
    if (!this._disposed) {
      this.editor.webview.postMessage(msg)
    }
  }

  // Do the preview content update
  private async doUpdate (): Promise<void> {
    this._logger.log('Updating the preview content')

    const resource = this._resource

    clearTimeout(this.throttleTimer)
    this.throttleTimer = undefined

    const document = await vscode.workspace.openTextDocument(resource)
    if (!this.forceUpdate && this.currentVersion &&
      this.currentVersion.resource.fsPath === resource.fsPath &&
      this.currentVersion.version === document.version) {
      if (this.line) {
        this.updateForView(resource, this.line)
      }
      return
    }
    this.forceUpdate = false

    this.currentVersion = { resource, version: document.version }

    // add webView
    if (this._resource === resource) {
      this.editor.title = AsciidocPreview.getPreviewTitle(this._resource, this._locked)
    }
    this.editor.iconPath = this.iconPath
    const asciidocPreviewConfiguration = this._previewConfigurations.loadAndCacheConfiguration(resource)
    this.editor.webview.options = AsciidocPreview.getWebviewOptions(resource, this._contributionProvider, asciidocPreviewConfiguration)
    this.editor.webview.html = await this._contentProvider.providePreviewHTML(document, this._previewConfigurations, this, this.line)
  }

  private static getWebviewOptions (
    resource: vscode.Uri,
    contributionProvider: AsciidocContributionProvider,
    asciidocPreviewConfiguration: AsciidocPreviewConfiguration
  ): vscode.WebviewOptions {
    return {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: AsciidocPreview.getLocalResourceRoots(resource, contributionProvider, asciidocPreviewConfiguration),
    }
  }

  private static getLocalResourceRoots (
    resource: vscode.Uri,
    contributionProvider: AsciidocContributionProvider,
    asciidocPreviewConfiguration: AsciidocPreviewConfiguration
  ): vscode.Uri[] {
    const baseRoots: vscode.Uri[] = [
      vscode.Uri.joinPath(contributionProvider.extensionUri, 'media'),
      vscode.Uri.joinPath(contributionProvider.extensionUri, 'dist'),
    ]
    const previewStylePath = asciidocPreviewConfiguration.previewStyle
    if (previewStylePath !== '') {
      const previewStyleUri = vscode.Uri.parse(previewStylePath)
      baseRoots.push(uri.Utils.dirname(previewStyleUri))
    }
    const folder = getWorkspaceFolder(resource)
    if (folder) {
      const workspaceRoots = getWorkspaceFolders()?.map((folder) => folder.uri)
      if (workspaceRoots) {
        baseRoots.push(...workspaceRoots)
      }
    } else {
      baseRoots.push(uri.Utils.dirname(resource))
    }

    return baseRoots
  }

  private onDidScrollPreview (line: number) {
    this.line = line
    for (const editor of vscode.window.visibleTextEditors) {
      if (!this.isPreviewOf(editor.document.uri)) {
        continue
      }

      this.isScrolling = true
      const sourceLine = Math.floor(line)
      const fraction = line - sourceLine
      const text = editor.document.lineAt(sourceLine).text
      const start = Math.floor(fraction * text.length)
      editor.revealRange(
        new vscode.Range(sourceLine, start, sourceLine + 1, 0),
        vscode.TextEditorRevealType.AtTop)
    }
  }

  private resolveDocumentLink (href: string): { path: string, fragment: string } {
    let [hrefPath, fragment] = href.split('#').map((c) => decodeURIComponent(c))
    if (hrefPath.startsWith('file:///')) {
      hrefPath = hrefPath.replace('file://', '')
    }
    if (!hrefPath.startsWith('/')) {
      // Relative path. Resolve relative to the file
      hrefPath = path.join(path.dirname(this.resource.fsPath), hrefPath)
    }
    return { path: hrefPath, fragment }
  }

  private async onDidClickPreviewLink (href: string) {
    const targetResource = this.resolveDocumentLink(href)
    const openLinks = this.config.get<string>('preview.openLinksToAsciidocFiles', 'inPreview')
    if (openLinks === 'inPreview') {
      const asciidocLink = await resolveLinkToAsciidocFile(targetResource.path)
      if (asciidocLink) {
        this.update(asciidocLink)
        return
      }
    }
    vscode.commands.executeCommand('_asciidoc.openDocumentLink', targetResource)
  }

  private async onCacheImageSizes (imageInfo: { id: string, width: number, height: number }[]) {
    this.imageInfo = imageInfo
  }

  asWebviewUri (resource: vscode.Uri) {
    return this.editor.webview.asWebviewUri(resource)
  }

  asMediaWebViewSrc (...pathSegments: string[]): string {
    return this.escapeAttribute(this.asWebviewUri(vscode.Uri.joinPath(this._contributionProvider.extensionUri, ...pathSegments)))
  }

  get cspSource () {
    return this.editor.webview.cspSource
  }

  private escapeAttribute (value: string | vscode.Uri): string {
    return value.toString().replace(/"/g, '&quot;')
  }
}

export interface PreviewSettings
{
  readonly resourceColumn: vscode.ViewColumn;
  readonly previewColumn: vscode.ViewColumn;
  readonly locked: boolean;
}
