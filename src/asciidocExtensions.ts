/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import type { Thenable } from 'vscode'

export interface AsciidocContributions {
  readonly extensionPath: string;
  readonly previewScripts: vscode.Uri[];
  readonly previewStylesEditor: vscode.Uri[];
  readonly previewStylesDefault: vscode.Uri[];
  readonly asciidocItPlugins: Thenable<(md: any) => any>[];
  readonly previewResourceRoots: vscode.Uri[];
}

class AsciidocExtensionContributions implements AsciidocContributions {
  private readonly _scripts: vscode.Uri[] = [];
  private readonly _stylesEditor: vscode.Uri[] = [];
  private readonly _stylesDefault: vscode.Uri[] = [];
  private readonly _previewResourceRoots: vscode.Uri[] = [];
  private readonly _plugins: Thenable<(md: any) => any>[] = [];

  private _loaded = false;

  public constructor (
    public readonly extensionPath: string
  ) {
    this.extensionPath = extensionPath
  }

  public get previewScripts (): vscode.Uri[] {
    this.ensureLoaded()
    return this._scripts
  }

  public get previewStylesEditor (): vscode.Uri[] {
    this.ensureLoaded()
    return this._stylesEditor
  }

  public get previewStylesDefault (): vscode.Uri[] {
    this.ensureLoaded()
    return this._stylesDefault
  }

  public get previewResourceRoots (): vscode.Uri[] {
    this.ensureLoaded()
    return this._previewResourceRoots
  }

  public get asciidocItPlugins (): Thenable<(md: any) => any>[] {
    this.ensureLoaded()
    return this._plugins
  }

  private ensureLoaded () {
    if (this._loaded) {
      return
    }

    this._loaded = true
    for (const extension of vscode.extensions.all) {
      const contributes = extension.packageJSON && extension.packageJSON.contributes
      if (!contributes) {
        continue
      }
    }
  }
}

export function getAsciidocExtensionContributions (context: vscode.ExtensionContext): AsciidocContributions {
  return new AsciidocExtensionContributions(context.extensionPath)
}
