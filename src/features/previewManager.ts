/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { Logger } from '../logger'
import { AsciidocContributionProvider } from '../asciidocExtensions'
import { disposeAll } from '../util/dispose'
import { AsciidocFileTopmostLineMonitor } from '../util/topmostLineMonitor'
import { AsciidocPreview, PreviewSettings } from './preview'
import { AsciidocPreviewConfigurationManager } from './previewConfig'
import { AsciidocContentProvider } from './previewContentProvider'

export class AsciidocPreviewManager implements vscode.WebviewPanelSerializer {
  private static readonly asciidocPreviewActiveContextKey = 'asciidocPreviewFocus'

  private readonly _topmostLineMonitor = new AsciidocFileTopmostLineMonitor()
  private readonly _previewConfigurations = new AsciidocPreviewConfigurationManager()
  private readonly _previews: AsciidocPreview[] = []
  private _activePreview: AsciidocPreview | undefined = undefined
  private readonly _disposables: vscode.Disposable[] = []

  public constructor (
    private readonly _contentProvider: AsciidocContentProvider,
    private readonly _logger: Logger,
    private readonly _contributionProvider: AsciidocContributionProvider
  ) {
    this._disposables.push(vscode.window.registerWebviewPanelSerializer(AsciidocPreview.viewType, this))
  }

  public dispose (): void {
    disposeAll(this._disposables)
    disposeAll(this._previews)
  }

  public refresh (forceUpdate: boolean = false) {
    for (const preview of this._previews) {
      preview.refresh(forceUpdate)
    }
  }

  public updateConfiguration () {
    for (const preview of this._previews) {
      preview.updateConfiguration()
    }
  }

  public preview (
    resource: vscode.Uri,
    previewSettings: PreviewSettings
  ): void {
    let preview = this.getExistingPreview(resource, previewSettings)
    if (preview) {
      preview.reveal(previewSettings.previewColumn)
    } else {
      preview = this.createNewPreview(resource, previewSettings)
    }

    preview.update(resource)
  }

  public get activePreviewResource () {
    return this._activePreview && this._activePreview.resource
  }

  public get activePreviewResourceColumn () {
    return this._activePreview && this._activePreview.resourceColumn
  }

  public toggleLock () {
    const preview = this._activePreview
    if (preview) {
      preview.toggleLock()

      // Close any previews that are now redundant, such as having two dynamic previews in the same editor group
      for (const otherPreview of this._previews) {
        if (otherPreview !== preview && preview.matches(otherPreview)) {
          otherPreview.dispose()
        }
      }
    }
  }

  public async deserializeWebviewPanel (
    webview: vscode.WebviewPanel,
    state: any
  ): Promise<void> {
    const preview = await AsciidocPreview.revive(
      webview,
      state,
      this._contentProvider,
      this._previewConfigurations,
      this._logger,
      this._topmostLineMonitor,
      this._contributionProvider)

    this.registerPreview(preview)
  }

  private getExistingPreview (
    resource: vscode.Uri,
    previewSettings: PreviewSettings
  ): AsciidocPreview | undefined {
    return this._previews.find((preview) =>
      preview.matchesResource(resource, previewSettings.previewColumn, previewSettings.locked))
  }

  private createNewPreview (
    resource: vscode.Uri,
    previewSettings: PreviewSettings
  ): AsciidocPreview {
    const preview = AsciidocPreview.create(
      resource,
      previewSettings.resourceColumn,
      previewSettings.previewColumn,
      previewSettings.locked,
      this._contentProvider,
      this._previewConfigurations,
      this._logger,
      this._topmostLineMonitor,
      this._contributionProvider)

    this.setPreviewActiveContext(true)
    this._activePreview = preview
    return this.registerPreview(preview)
  }

  private registerPreview (
    preview: AsciidocPreview
  ): AsciidocPreview {
    this._previews.push(preview)

    preview.onDispose(() => {
      const existing = this._previews.indexOf(preview)
      if (existing === -1) {
        return
      }

      this._previews.splice(existing, 1)
      if (this._activePreview === preview) {
        this.setPreviewActiveContext(false)
        this._activePreview = undefined
      }
    })

    preview.onDidChangeViewState(({ webviewPanel }) => {
      disposeAll(this._previews.filter((otherPreview) => preview !== otherPreview && preview!.matches(otherPreview)))
      this.setPreviewActiveContext(webviewPanel.active)
      this._activePreview = webviewPanel.active ? preview : undefined
    })

    return preview
  }

  private setPreviewActiveContext (value: boolean) {
    vscode.commands.executeCommand('setContext', AsciidocPreviewManager.asciidocPreviewActiveContextKey, value)
  }
}
