import * as path from 'node:path'
import * as vscode from 'vscode'
import * as uri from 'vscode-uri'
import { resolveLinkToAsciidocFile } from '../../commands/openDocumentLink.js'
import { Disposable, disposeAll } from '../../core/dispose.js'
import { isAsciidocFile } from '../../core/file.js'
import { t as l10nT } from '../../core/l10n.js'
import { Logger } from '../../core/logger.js'
import { WebviewResourceProvider } from '../../core/resources.js'
import {
  getWorkspaceFolder,
  getWorkspaceFolders,
} from '../../core/workspace.js'
import { AsciidocContributionProvider } from '../extensionContributions.js'
import {
  AsciidocPreviewConfiguration,
  AsciidocPreviewConfigurationManager,
} from './previewConfig.js'
import { AsciidocContentProvider } from './previewContentProvider.js'
import {
  AsciidocFileTopmostLineMonitor,
  getVisibleLine,
} from './topmostLineMonitor.js'

export class AsciidocPreview
  extends Disposable
  implements WebviewResourceProvider
{
  public static viewType = 'asciidoc.preview'

  private _resource: vscode.Uri
  // Never assigned by either `create()` or `revive()` — the `resourceColumn`
  // parameter `create()` accepts is not threaded into the constructor — so
  // `resourceColumn` below always falls back to its default. Pre-existing;
  // not touched here since fixing it changes preview column placement.
  private _resourceColumn: vscode.ViewColumn = vscode.ViewColumn.One
  private _locked: boolean

  private readonly editor: vscode.WebviewPanel
  private throttleTimer: any
  private line: number | undefined = undefined
  // Anchor to scroll to once the next (full) render of the preview has loaded.
  // Set when following an interdocument link with a fragment so the freshly
  // opened document lands on the referenced anchor instead of its top.
  private pendingScrollToFragment: string | undefined = undefined
  private readonly disposables: vscode.Disposable[] = []
  private firstUpdate = true
  private currentVersion?: { resource: vscode.Uri; version: number }
  private forceUpdate = false
  // While the preview is driving the editor (preview scroll -> revealLine ->
  // editor reveal), the editor's visible-range changes must not be echoed back
  // as `updateView`, or the preview fights the user's scroll (flicker, #638). A
  // single boolean only guards one event; a short time window covers the whole
  // burst, including the animated `revealRange` when `editor.smoothScrolling`
  // is on.
  private revealingEditorUntil = 0
  private _disposed: boolean = false
  private imageInfo: { id: string; width: number; height: number }[] = []
  private config: vscode.WorkspaceConfiguration
  private refreshInterval: number
  // When true, the next content update replaces the whole webview HTML (full
  // reload). Otherwise the new content is sent to the webview to be morphed in
  // place, preserving scroll position and already-rendered MathJax / Mermaid /
  // highlight.js / image output. Reset to true on resource or configuration
  // changes, and whenever the (non-retained) webview is revealed.
  private needsFullReload = true
  // True once an incremental (morphed) update has been applied, meaning the
  // last HTML assigned to `webview.html` no longer matches what is displayed.
  // A non-retained webview that gets destroyed while hidden would otherwise
  // reload that stale HTML when revealed.
  private webviewHtmlIsStale = false
  // `data-shell` fingerprint of the last HTML handed to the webview. The
  // converter hashes the document-driven parts of the shell that an incremental
  // morph of `#preview-root` cannot update (the <head> scripts and styles, the
  // <body> classes). When a document edit changes it — toggling `:stem:` or
  // `:source-highlighter:`, a listing in a new language… — the update falls
  // back to a full reload so MathJax/highlight.js are (un)loaded and every
  // block is re-rendered consistently instead of leaving raw equations or a
  // mix of stale and fresh block renderings.
  private lastShellFingerprint: string | undefined

  public static async revive(
    webview: vscode.WebviewPanel,
    state: any,
    contentProvider: AsciidocContentProvider,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    contributionProvider: AsciidocContributionProvider,
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
      contributionProvider,
    )

    preview.editor.webview.options = AsciidocPreview.getWebviewOptions(
      resource,
      contributionProvider,
      previewConfigurations.loadAndCacheConfiguration(resource),
    )

    if (!isNaN(line)) {
      preview.line = line
    }
    await preview.doUpdate()
    return preview
  }

  public static create(
    resource: vscode.Uri,
    resourceColumn: vscode.ViewColumn,
    previewColumn: vscode.ViewColumn,
    locked: boolean,
    contentProvider: AsciidocContentProvider,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    contributionProvider: AsciidocContributionProvider,
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
        ...AsciidocPreview.getWebviewOptions(
          resource,
          contributionProvider,
          previewConfigurations.loadAndCacheConfiguration(resource),
        ),
      },
    )

    return new AsciidocPreview(
      webview,
      resource,
      locked,
      contentProvider,
      previewConfigurations,
      logger,
      topmostLineMonitor,
      contributionProvider,
    )
  }

  private constructor(
    webview: vscode.WebviewPanel,
    resource: vscode.Uri,
    locked: boolean,
    private readonly _contentProvider: AsciidocContentProvider,
    private readonly _previewConfigurations: AsciidocPreviewConfigurationManager,
    private readonly _logger: Logger,
    topmostLineMonitor: AsciidocFileTopmostLineMonitor,
    private readonly _contributionProvider: AsciidocContributionProvider,
  ) {
    super()
    this._resource = resource

    this._locked = locked
    this.editor = webview
    this.config = vscode.workspace.getConfiguration('asciidoc', this.resource)
    this.refreshInterval = this.config.get<number>(
      'preview.refreshInterval',
      2000,
    )

    this.editor.onDidDispose(
      () => {
        this.dispose()
      },
      null,
      this.disposables,
    )

    this.editor.onDidChangeViewState(
      (e) => {
        this._onDidChangeViewStateEmitter.fire(e)
        // When the preview is not retained across hiding, VS Code destroys the
        // webview and reloads it from the last full HTML when it is revealed
        // again, dropping any incremental (morphed) updates. Force a full
        // reload on reveal so the content reflects the latest version.
        const preservePreviewWhenHidden = vscode.workspace
          .getConfiguration('asciidoc', null)
          .get<boolean>('preview.preservePreviewWhenHidden', false)
        if (
          e.webviewPanel.visible &&
          !preservePreviewWhenHidden &&
          this.webviewHtmlIsStale
        ) {
          // `refresh(true)` forces a full reload, which is what we need here:
          // VS Code reloaded the webview from the last full HTML and dropped any
          // morphed updates.
          this.refresh(true)
        }
      },
      null,
      this.disposables,
    )

    this.editor.webview.onDidReceiveMessage(
      (e) => {
        if (e.source !== this._resource.toString()) {
          return
        }

        switch (e.type) {
          case 'cacheImageSizes':
            this.onCacheImageSizes(e.body)
            break

          case 'revealLine':
            this.onDidScrollPreview(e.body.line, e.body.atBottom)
            break

          case 'clickLink':
            this.onDidClickPreviewLink(e.body.href)
            break

          case 'showPreviewSecuritySelector':
            vscode.commands.executeCommand(
              'asciidoc.showPreviewSecuritySelector',
              e.body.source,
            )
            break

          case 'previewStyleLoadError':
            vscode.window
              .showWarningMessage(
                l10nT(
                  'preview.styleLoadError.message',
                  e.body.unloadedStyles.join(', '),
                ),
              )
              .then()
            break
        }
      },
      null,
      this.disposables,
    )

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (this.isPreviewOf(event.document.uri)) {
          this.refresh()
        }
      },
      null,
      this.disposables,
    )

    topmostLineMonitor.onDidChangeTopmostLine(
      (event) => {
        if (this.isPreviewOf(event.resource)) {
          this.updateForView(event.resource, event.line)
        }
      },
      null,
      this.disposables,
    )

    vscode.window.onDidChangeTextEditorSelection(
      (event) => {
        if (this.isPreviewOf(event.textEditor.document.uri)) {
          const line = event.selections[0].active.line
          // Send the cursor line to move the active-line highlight, but do NOT
          // set `this.line` from it: `this.line` is the scroll anchor consumed by
          // `providePreviewHTML`/`updateForView`, and pointing it at the caret
          // would make the next (re)render scroll the preview to the cursor even
          // though the user only moved the selection. The anchor is maintained by
          // real scrolling (`onDidScrollPreview`, the topmost-line monitor) and by
          // `update()` reading the editor's visible line.
          this.postMessage({
            type: 'onDidChangeTextEditorSelection',
            line,
            source: this.resource.toString(),
          })
        }
      },
      null,
      this.disposables,
    )

    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor && isAsciidocFile(editor.document) && !this._locked) {
          // Only follow a switch to a *different* document. The preview is a
          // webview in the editor area, so focusing it clears
          // `activeTextEditor`; merely clicking back into the already-previewed
          // editor fires this event again with the same document. Calling
          // `update()` there would hit `doUpdate()`'s unchanged-version path,
          // which re-emits `updateView` and snaps the preview back to the
          // editor's top line — scrolling it when the user only moved focus.
          // A real editor scroll still syncs through the topmost-line monitor.
          if (editor.document.uri.fsPath !== this._resource.fsPath) {
            this.update(editor.document.uri)
          }
        }
      },
      null,
      this.disposables,
    )
  }

  private readonly _onDisposeEmitter = new vscode.EventEmitter<void>()
  public readonly onDispose = this._onDisposeEmitter.event

  private readonly _onDidChangeViewStateEmitter =
    new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>()
  public readonly onDidChangeViewState = this._onDidChangeViewStateEmitter.event

  public get resource(): vscode.Uri {
    return this._resource
  }

  public get resourceColumn(): vscode.ViewColumn {
    return this._resourceColumn || vscode.ViewColumn.One
  }

  public get state() {
    return {
      resource: this._resource.toString(),
      locked: this._locked,
      line: this.line,
      imageInfo: this.imageInfo,
    }
  }

  override dispose() {
    super.dispose()

    this._disposed = true
    this._onDisposeEmitter.fire()

    this._onDisposeEmitter.dispose()
    this._onDidChangeViewStateEmitter.dispose()
    this.editor.dispose()

    disposeAll(this.disposables)

    clearTimeout(this.throttleTimer)
    this.throttleTimer = undefined
  }

  // This method is invoked evrytime there is a document update
  public update(resource: vscode.Uri) {
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.uri.fsPath === resource.fsPath) {
      this.line = getVisibleLine(editor)
    }

    // If we have changed resources, cancel any pending updates
    const isResourceChange = resource.fsPath !== this._resource.fsPath
    if (isResourceChange) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = undefined
      // A different document means a different shell: force a full reload.
      this.needsFullReload = true
    }

    this._resource = resource

    // Schedule update if none is pending
    if (!this.throttleTimer) {
      if (isResourceChange || this.firstUpdate || this.forceUpdate) {
        this.doUpdate()
      } else {
        if (this.refreshInterval > 0) {
          this.throttleTimer = setTimeout(
            () => this.doUpdate(),
            this.refreshInterval,
          )
        }
      }
    }

    this.firstUpdate = false
  }

  public refresh(
    forceUpdate: boolean = false,
    fullReload: boolean = forceUpdate,
  ) {
    this.forceUpdate = forceUpdate
    // `forceUpdate` bypasses the unchanged-version early-return in `doUpdate()`,
    // re-rendering the content even when `document.version` has not moved.
    // `fullReload` then decides *how* that render reaches the webview:
    //
    // - Most forced refreshes are triggered by an out-of-band shell change — an
    //   explicit "Refresh Preview", a settings/theme change, a security level
    //   change — which lives in the webview shell/<head> (styles, the
    //   server-side theme attribute) that an incremental morph of
    //   `#preview-root` does not touch. Those rebuild the whole webview, so
    //   `fullReload` defaults to `forceUpdate`.
    // - A save is different: it forces a re-render only so an open preview picks
    //   up `include::`d files changed on disk (a save does not bump
    //   `document.version`), but the shell is unchanged. Such callers pass
    //   `fullReload = false` to keep the incremental morph path, which preserves
    //   the preview (and editor) scroll position instead of resetting it.
    //
    // (Plain document edits go through `refresh()` with no arguments and keep
    // the fast incremental path.)
    if (fullReload) {
      this.needsFullReload = true
    }
    this.update(this._resource)
  }

  public updateConfiguration() {
    if (this._previewConfigurations.hasConfigurationChanged(this._resource)) {
      this.config = vscode.workspace.getConfiguration('asciidoc', this.resource)
      this.refreshInterval = this.config.get<number>(
        'preview.refreshInterval',
        2000,
      )
      // The document text is unchanged, so this must be a *forced* refresh:
      // otherwise `doUpdate()` throttles it and then skips it on the
      // unchanged-version early-return, and the new settings never take effect
      // on an open preview. Forcing also rebuilds the shell/<head> where
      // styles and other shell-level settings live.
      this.refresh(true)
    }
  }

  public get position(): vscode.ViewColumn | undefined {
    return this.editor.viewColumn
  }

  public matchesResource(
    otherResource: vscode.Uri,
    otherPosition: vscode.ViewColumn | undefined,
    otherLocked: boolean,
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

  public matches(otherPreview: AsciidocPreview): boolean {
    return this.matchesResource(
      otherPreview._resource,
      otherPreview.position,
      otherPreview._locked,
    )
  }

  public reveal(viewColumn: vscode.ViewColumn) {
    this.editor.reveal(viewColumn)
  }

  public toggleLock() {
    this._locked = !this._locked
    this.editor.title = AsciidocPreview.getPreviewTitle(
      this._resource,
      this._locked,
    )
  }

  private get iconPath() {
    const root = vscode.Uri.joinPath(
      this._contributionProvider.extensionUri,
      'media',
    )
    return {
      light: vscode.Uri.joinPath(root, 'preview-light.svg'),
      dark: vscode.Uri.joinPath(root, 'preview-dark.svg'),
    }
  }

  private isPreviewOf(resource: vscode.Uri): boolean {
    return this._resource.fsPath === resource.fsPath
  }

  private static getPreviewTitle(
    resource: vscode.Uri,
    locked: boolean,
  ): string {
    return locked
      ? l10nT('preview.locked.title', path.basename(resource.fsPath))
      : l10nT('preview.unlocked.title', path.basename(resource.fsPath))
  }

  private updateForView(resource: vscode.Uri, topLine: number | undefined) {
    if (!this.isPreviewOf(resource)) {
      return
    }

    if (Date.now() < this.revealingEditorUntil) {
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

  private postMessage(msg: any) {
    if (!this._disposed) {
      this.editor.webview.postMessage(msg)
    }
  }

  // Do the preview content update
  private async doUpdate(): Promise<void> {
    this._logger.debug('Updating the preview content')

    const resource = this._resource

    clearTimeout(this.throttleTimer)
    this.throttleTimer = undefined

    if (this._disposed) {
      return
    }

    const document = await vscode.workspace.openTextDocument(resource)
    if (
      !this.forceUpdate &&
      this.currentVersion &&
      this.currentVersion.resource.fsPath === resource.fsPath &&
      this.currentVersion.version === document.version
    ) {
      if (this.line) {
        this.updateForView(resource, this.line)
      }
      return
    }
    this.forceUpdate = false

    this.currentVersion = {
      resource,
      version: document.version,
    }

    // add webView
    if (this._resource === resource) {
      this.editor.title = AsciidocPreview.getPreviewTitle(
        this._resource,
        this._locked,
      )
    }
    this.editor.iconPath = this.iconPath
    const asciidocPreviewConfiguration =
      this._previewConfigurations.loadAndCacheConfiguration(resource)
    this.editor.webview.options = AsciidocPreview.getWebviewOptions(
      resource,
      this._contributionProvider,
      asciidocPreviewConfiguration,
    )
    const html = await this._contentProvider.providePreviewHTML(
      document,
      this._previewConfigurations,
      this,
      this.line,
      this.pendingScrollToFragment,
    )
    // One-shot: consume the anchor so later refreshes of the same document do
    // not keep jumping back to it.
    this.pendingScrollToFragment = undefined
    // A shell change (see lastShellFingerprint) cannot be applied by the
    // incremental morph: force a full reload.
    const shellFingerprint = /\bdata-shell="([^"]*)"/.exec(html)?.[1]
    if (shellFingerprint !== this.lastShellFingerprint) {
      this.needsFullReload = true
      this.lastShellFingerprint = shellFingerprint
    }
    if (this.needsFullReload) {
      // Full reload: rebuild the entire webview (shell + content).
      this.editor.webview.html = html
      this.needsFullReload = false
      this.webviewHtmlIsStale = false
    } else {
      // Incremental update: hand the freshly rendered document to the webview
      // so it can morph `#preview-root` in place instead of reloading.
      this.postMessage({
        type: 'updateContent',
        html,
        source: resource.toString(),
      })
      this.webviewHtmlIsStale = true
    }
  }

  private static getWebviewOptions(
    resource: vscode.Uri,
    contributionProvider: AsciidocContributionProvider,
    asciidocPreviewConfiguration: AsciidocPreviewConfiguration,
  ): vscode.WebviewOptions {
    return {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: AsciidocPreview.getLocalResourceRoots(
        resource,
        contributionProvider,
        asciidocPreviewConfiguration,
      ),
    }
  }

  private static getLocalResourceRoots(
    resource: vscode.Uri,
    contributionProvider: AsciidocContributionProvider,
    asciidocPreviewConfiguration: AsciidocPreviewConfiguration,
  ): vscode.Uri[] {
    const baseRoots: vscode.Uri[] = [
      vscode.Uri.joinPath(contributionProvider.extensionUri, 'media'),
      vscode.Uri.joinPath(contributionProvider.extensionUri, 'dist'),
    ]
    // Whitelist the directory of an *absolute local* custom stylesheet so the
    // webview can load it from outside the workspace. Relative paths already
    // resolve under a whitelisted root (a workspace folder, or the document's
    // own folder added below), and URLs are loaded directly. `Uri.file` (not
    // `Uri.parse`) keeps a Windows drive path such as `C:\styles\site.css` from
    // being mistaken for a URI whose scheme is the drive letter (#430).
    const previewStylePath = asciidocPreviewConfiguration.previewStyle
    if (
      previewStylePath !== '' &&
      !/^(https?|file):/i.test(previewStylePath) &&
      (previewStylePath.startsWith('/') ||
        /^[a-z]:[\\/]/i.test(previewStylePath))
    ) {
      baseRoots.push(uri.Utils.dirname(vscode.Uri.file(previewStylePath)))
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

  private onDidScrollPreview(line: number, atBottom: boolean = false) {
    this.line = line
    // Suppress the editor -> preview echo for the whole reveal (and its
    // smooth-scroll animation) so the preview does not bounce back.
    this.revealingEditorUntil = Date.now() + 250
    for (const editor of vscode.window.visibleTextEditors) {
      if (!this.isPreviewOf(editor.document.uri)) {
        continue
      }

      const sourceLine = Math.floor(line)
      const fraction = line - sourceLine
      const text = editor.document.lineAt(sourceLine).text
      const start = Math.floor(fraction * text.length)
      editor.revealRange(
        new vscode.Range(sourceLine, start, sourceLine + 1, 0),
        // When the preview is scrolled to the very bottom, just bring the last
        // line into view (minimal scroll) instead of pinning it to the top,
        // which would scroll the editor further than necessary.
        atBottom
          ? vscode.TextEditorRevealType.Default
          : vscode.TextEditorRevealType.AtTop,
      )
    }
  }

  private resolveDocumentLink(href: string): {
    path: string
    fragment: string
  } {
    let [hrefPath, fragment] = href.split('#').map((c) => decodeURIComponent(c))
    if (hrefPath.startsWith('file:///')) {
      hrefPath = hrefPath.replace('file://', '')
    }
    if (!hrefPath.startsWith('/')) {
      // Relative path. Resolve relative to the file
      hrefPath = path.join(path.dirname(this.resource.fsPath), hrefPath)
    }
    return {
      path: hrefPath,
      fragment,
    }
  }

  private async onDidClickPreviewLink(href: string) {
    const targetResource = this.resolveDocumentLink(href)
    const openLinks = this.config.get<string>(
      'preview.openLinksToAsciidocFiles',
      'inPreview',
    )
    if (openLinks === 'inPreview') {
      const asciidocLink = await resolveLinkToAsciidocFile(targetResource.path)
      if (asciidocLink) {
        // Opening another document in place forces a full reload; carry the
        // fragment so the new render scrolls to the referenced anchor.
        this.pendingScrollToFragment = targetResource.fragment || undefined
        this.update(asciidocLink)
        return
      }
    }
    vscode.commands.executeCommand('_asciidoc.openDocumentLink', targetResource)
  }

  private async onCacheImageSizes(
    imageInfo: { id: string; width: number; height: number }[],
  ) {
    this.imageInfo = imageInfo
  }

  asWebviewUri(resource: vscode.Uri) {
    return this.editor.webview.asWebviewUri(resource)
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return this.escapeAttribute(
      this.asWebviewUri(
        vscode.Uri.joinPath(
          this._contributionProvider.extensionUri,
          ...pathSegments,
        ),
      ),
    )
  }

  get cspSource() {
    return this.editor.webview.cspSource
  }

  private escapeAttribute(value: string | vscode.Uri): string {
    return value.toString().replace(/"/g, '&quot;')
  }
}

export interface PreviewSettings {
  readonly resourceColumn: vscode.ViewColumn
  readonly previewColumn: vscode.ViewColumn
  readonly locked: boolean
}
